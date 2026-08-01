"use client";

/**
 * Gemini Live API — browser client.
 *
 * Verified against https://ai.google.dev/gemini-api/docs/live-api and the
 * capabilities guide:
 *
 *   model    gemini-3.1-flash-live-preview   (2.5 live models are deprecated)
 *   input    raw PCM, 16-bit LE, mono, 16 kHz — "audio/pcm;rate=16000"
 *   output   raw PCM, 16-bit LE, mono, 24 kHz
 *   auth     ephemeral token as `apiKey`, apiVersion "v1alpha"
 *   send     sendRealtimeInput({ audio | video | text }) — never `media`
 *   receive  a single event may carry MULTIPLE parts; process all of them
 *   language native audio picks the language itself and does NOT accept a
 *            language code — it is steered in the system instruction, and the
 *            model may switch mid-conversation if the patient does
 */

import { GoogleGenAI, Modality, Type, ThinkingLevel } from "@google/genai";
import type { LiveServerMessage, LiveConnectConfig, Tool } from "@google/genai";
import type { Locale } from "./i18n";
import { systemInstruction, LOCALES } from "./i18n";

const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;

export interface LiveCallbacks {
  /** Running transcript of what the PATIENT said, in their language. */
  onUserTranscript(text: string, isFinal: boolean): void;
  /** Running transcript of what the AGENT said. */
  onAgentTranscript(text: string, isFinal: boolean): void;
  /** The model was interrupted — stop playback immediately. */
  onInterrupted(): void;
  /** A tool the app must execute. Return the result to send back. */
  onToolCall(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  onOpen?(): void;
  onClose?(reason: string): void;
  onError?(message: string): void;
}

export interface LiveHandle {
  /** Push one chunk of mic audio. */
  close(): void;
  /** Flush cached audio when the mic is paused. */
  pauseMic(): void;
  resumeMic(): void;
  /** Send text in-band (accessibility fallback while staying in the same session). */
  sendText(text: string): void;
  readonly muted: boolean;
}

/** Tool declarations. Kept small and expressive — the engine does the real work. */
export const LIVE_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "get_relevant_medications",
        description:
          "Look up the patient's active medications and when each was started. Call this as soon " +
          "as the patient describes a symptom with any sense of timing.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            symptom: { type: Type.STRING, description: "The symptom the patient described" },
            onsetDaysAgo: { type: Type.NUMBER, description: "How many days ago it began, best estimate" },
          },
          required: ["symptom"],
        },
      },
      {
        name: "check_red_flags",
        description:
          "Run the clinic's deterministic safety rules against what the patient has said so far. " +
          "Call after every patient turn. If it returns escalate:true, follow its instruction " +
          "immediately and abandon the routine questions.",
        parameters: {
          type: Type.OBJECT,
          properties: { transcript: { type: Type.STRING, description: "What the patient just said" } },
          required: ["transcript"],
        },
      },
      {
        name: "save_confirmed_statement",
        description: "Record something the patient has confirmed. Draft only — never enters the chart.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            category: { type: Type.STRING, description: "symptom | medication | history | concern" },
          },
          required: ["text"],
        },
      },
      {
        name: "run_eligibility_check",
        description:
          "Check the patient's insurance benefits. Returns copays by place of service, coinsurance " +
          "and deductible remaining. It does NOT return a total price and you must not imply one.",
        parameters: { type: Type.OBJECT, properties: {} },
      },
    ],
  },
];

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const out = new DataView(new ArrayBuffer(input.length * 2));
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out.buffer;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/** Sequential 24 kHz playback queue that can be flushed on interruption. */
class Player {
  private ctx: AudioContext | null = null;
  private nextStart = 0;
  private live: AudioBufferSourceNode[] = [];

  private context(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ sampleRate: OUTPUT_RATE });
      this.nextStart = 0;
    }
    return this.ctx;
  }

  enqueue(pcm: Int16Array) {
    const ctx = this.context();
    if (ctx.state === "suspended") void ctx.resume();

    const buf = ctx.createBuffer(1, pcm.length, OUTPUT_RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    const now = ctx.currentTime;
    const at = Math.max(now, this.nextStart);
    src.start(at);
    this.nextStart = at + buf.duration;

    this.live.push(src);
    src.onended = () => {
      this.live = this.live.filter((s) => s !== src);
    };
  }

  /** Barge-in: kill everything queued and reset the clock. */
  flush() {
    for (const s of this.live) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.live = [];
    this.nextStart = this.ctx?.currentTime ?? 0;
  }

  close() {
    this.flush();
    void this.ctx?.close();
    this.ctx = null;
  }
}

export async function connectLive(opts: {
  locale: Locale;
  chartSummary: string;
  voiceName?: string;
  callbacks: LiveCallbacks;
}): Promise<LiveHandle> {
  const res = await fetch("/api/gemini-token");
  if (!res.ok) throw new Error("gemini_unconfigured");
  const { token, model } = (await res.json()) as { token: string; model: string };

  const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });
  const player = new Player();

  let userBuf = "";
  let agentBuf = "";
  let closed = false;

  const session = await ai.live.connect({
    model,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: {
        parts: [{ text: systemInstruction(opts.locale, opts.chartSummary) }],
      },
      // Both directions transcribed: the patient's words are the clinical
      // record, and the agent's are what we must be able to audit.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voiceName ?? "Kore" } },
      },
      // Lowest latency: this is turn-taking conversation, not a reasoning task.
      // The clinical reasoning is deterministic and lives in lib/clinical.ts.
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          // Patients pause mid-sentence while thinking. Give them room rather
          // than cutting them off — the whole product premise is that being
          // interrupted is what goes wrong in the exam room.
          prefixPaddingMs: 120,
          silenceDurationMs: 900,
        },
      },
      tools: LIVE_TOOLS,
    } satisfies LiveConnectConfig,
    callbacks: {
      onopen: () => opts.callbacks.onOpen?.(),

      onmessage: (msg: LiveServerMessage) => {
        const content = msg.serverContent;

        if (content) {
          // A single event can carry several parts. Process all of them.
          if (content.interrupted) {
            player.flush();
            opts.callbacks.onInterrupted();
          }
          for (const part of content.modelTurn?.parts ?? []) {
            if (part.inlineData?.data) player.enqueue(base64ToInt16(part.inlineData.data));
          }
          if (content.inputTranscription?.text) {
            userBuf += content.inputTranscription.text;
            opts.callbacks.onUserTranscript(userBuf, false);
          }
          if (content.outputTranscription?.text) {
            agentBuf += content.outputTranscription.text;
            opts.callbacks.onAgentTranscript(agentBuf, false);
          }
          if (content.turnComplete) {
            if (userBuf.trim()) opts.callbacks.onUserTranscript(userBuf.trim(), true);
            if (agentBuf.trim()) opts.callbacks.onAgentTranscript(agentBuf.trim(), true);
            userBuf = "";
            agentBuf = "";
          }
        }

        // Function calling is synchronous — the model waits for the response.
        const toolCall = msg.toolCall;
        if (toolCall?.functionCalls?.length) {
          void (async () => {
            const responses = [];
            for (const fc of toolCall.functionCalls!) {
              let response: Record<string, unknown>;
              try {
                response = await opts.callbacks.onToolCall(
                  fc.name ?? "",
                  (fc.args ?? {}) as Record<string, unknown>
                );
              } catch (err) {
                response = { error: (err as Error).message };
              }
              responses.push({ id: fc.id, name: fc.name, response });
            }
            try {
              session.sendToolResponse({ functionResponses: responses });
            } catch (err) {
              opts.callbacks.onError?.(`tool response failed: ${(err as Error).message}`);
            }
          })();
        }
      },

      onerror: (e: { message?: string }) =>
        opts.callbacks.onError?.(e?.message ?? "live session error"),
      onclose: (e: { reason?: string }) => {
        closed = true;
        player.close();
        opts.callbacks.onClose?.(e?.reason ?? "closed");
      },
    },
  });

  /* ---------------- microphone ---------------- */

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const micCtx = new Ctor({ sampleRate: INPUT_RATE });
  const source = micCtx.createMediaStreamSource(stream);
  const node = micCtx.createScriptProcessor(4096, 1, 1);
  let muted = false;

  node.onaudioprocess = (e) => {
    if (closed || muted) return;
    const pcm = floatTo16BitPCM(e.inputBuffer.getChannelData(0));
    try {
      session.sendRealtimeInput({
        audio: { data: toBase64(pcm), mimeType: `audio/pcm;rate=${INPUT_RATE}` },
      });
    } catch {
      /* socket closing */
    }
  };

  source.connect(node);
  node.connect(micCtx.destination);

  return {
    get muted() {
      return muted;
    },
    pauseMic() {
      muted = true;
      // Flush anything cached server-side so the turn ends cleanly.
      try {
        (session as unknown as { sendRealtimeInput(x: unknown): void }).sendRealtimeInput({
          audioStreamEnd: true,
        });
      } catch {
        /* not fatal */
      }
    },
    resumeMic() {
      muted = false;
      if (micCtx.state === "suspended") void micCtx.resume();
    },
    sendText(text: string) {
      try {
        session.sendRealtimeInput({ text });
      } catch (err) {
        opts.callbacks.onError?.((err as Error).message);
      }
    },
    close() {
      closed = true;
      try {
        node.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        void micCtx.close();
      } catch {
        /* best effort */
      }
      player.close();
      try {
        session.close();
      } catch {
        /* already closed */
      }
    },
  };
}

/** Human-readable summary of the chart, injected into the system instruction. */
export function chartSummaryFor(meds: { name: string; dosage: string; startedDaysAgo: number }[], conditions: string[]) {
  return [
    "Active medications:",
    ...meds.map((m) => `  - ${m.name} ${m.dosage}, started ${m.startedDaysAgo} days ago`),
    conditions.length ? `Conditions: ${conditions.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const voiceForLocale = (locale: Locale): string => {
  // Native audio picks the language itself; the voice is a timbre choice only.
  void LOCALES[locale];
  return "Kore";
};
