"use client";

/**
 * Deepgram Voice Agent — browser client.
 *
 * This is the PRIMARY voice path for English, because the single largest live
 * risk in this demo is a drug name transcribing wrong. "Metoprolol" and
 * "metolazone" differ by one phoneme and are unrelated drugs; "lamotrigine" is
 * the word the entire demo turns on. Nova-3 Medical plus keyterm prompting over
 * a CLOSED vocabulary — this patient's own eight medications — is the strongest
 * mitigation available anywhere in the stack.
 *
 * Gemini Live takes over when the patient is not speaking English, because its
 * native-audio models detect and switch language automatically.
 *
 * Verified against developers.deepgram.com:
 *   endpoint  wss://agent.deepgram.com/v1/agent/converse
 *   auth      browsers cannot set headers → token via Sec-WebSocket-Protocol
 *   in        linear16 PCM, mono, 16 kHz
 *   out       linear16 PCM, mono, 24 kHz
 *   tools     FunctionCallRequest.functions[].arguments is a JSON-ENCODED STRING
 *             FunctionCallResponse.content must be a STRING
 *   barge-in  UserStartedSpeaking → flush playback immediately
 *   safety    InjectAgentMessage { behavior: "interrupt" } lets our deterministic
 *             rules cut the model off mid-sentence
 */

import type { Locale } from "./i18n";
import { systemInstruction } from "./i18n";

const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
const KEEPALIVE_MS = 8000;

const ENDPOINT =
  process.env.NEXT_PUBLIC_DEEPGRAM_AGENT_URL || "wss://agent.deepgram.com/v1/agent/converse";

/**
 * The credential type is encoded in the WebSocket subprotocol NAME, and the two
 * names are not interchangeable: "token" authenticates a raw API key, "bearer"
 * a short-lived JWT from POST /v1/auth/grant. `/api/deepgram-token` mints a JWT
 * (it returns `access_token`), so this must stay "bearer". Getting it wrong
 * fails the handshake before any Deepgram frame is sent, so the only symptom is
 * an opaque close code 1006 — which reads like a network fault, not an auth bug.
 */
export const DG_AUTH_SUBPROTOCOL = "bearer";

export interface DgLatency {
  stt?: number;
  ttt?: number;
  tts?: number;
  total?: number;
}

export interface DgCallbacks {
  onUserTranscript(text: string, isFinal: boolean): void;
  onAgentTranscript(text: string, isFinal: boolean): void;
  /** The patient started talking — the agent must stop. */
  onBargeIn(): void;
  /** Real numbers from the wire, not estimates. */
  onLatency(l: DgLatency): void;
  onToolCall(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  onOpen?(): void;
  onClose?(reason: string): void;
  onError?(message: string): void;
}

export interface DgHandle {
  close(): void;
  /**
   * Make the agent say something RIGHT NOW, cutting off whatever it is saying.
   * Used when a deterministic safety rule fires: the rules outrank the model.
   */
  interruptWith(message: string): void;
  readonly open: boolean;
}

/* ------------------------------------------------------------------ */
/* audio helpers                                                       */
/* ------------------------------------------------------------------ */

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const out = new DataView(new ArrayBuffer(input.length * 2));
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out.buffer;
}

/** Sequential playback queue that can be flushed the instant the patient speaks. */
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

  enqueue(bytes: ArrayBuffer) {
    const pcm = new Int16Array(bytes);
    if (!pcm.length) return;
    const ctx = this.context();
    if (ctx.state === "suspended") void ctx.resume();

    const buf = ctx.createBuffer(1, pcm.length, OUTPUT_RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const at = Math.max(ctx.currentTime, this.nextStart);
    src.start(at);
    this.nextStart = at + buf.duration;
    this.live.push(src);
    src.onended = () => {
      this.live = this.live.filter((s) => s !== src);
    };
  }

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

/* ------------------------------------------------------------------ */
/* tool declarations                                                   */
/* ------------------------------------------------------------------ */

export const DG_FUNCTIONS = [
  {
    name: "get_relevant_medications",
    description:
      "Look up the patient's active medications and when each was started. Call this as soon as " +
      "the patient describes a symptom with any sense of timing.",
    parameters: {
      type: "object",
      properties: {
        symptom: { type: "string", description: "The symptom the patient described" },
        onset_days_ago: { type: "number", description: "How many days ago it began, best estimate" },
      },
      required: ["symptom"],
    },
  },
  {
    name: "check_red_flags",
    description:
      "Run the clinic's deterministic safety rules against what the patient just said. Call after " +
      "every patient turn. If it returns escalate true, follow the instruction verbatim and stop " +
      "the routine questions.",
    parameters: {
      type: "object",
      properties: { transcript: { type: "string", description: "What the patient just said" } },
      required: ["transcript"],
    },
  },
  {
    name: "save_confirmed_statement",
    description: "Record something the patient confirmed. Draft only — never enters the chart.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string" },
        category: { type: "string", description: "symptom | medication | history | concern" },
      },
      required: ["text"],
    },
  },
  {
    name: "run_eligibility_check",
    description:
      "Check insurance benefits. Returns copay by place of service, coinsurance, and deductible " +
      "remaining. It does NOT return a total price and you must never imply one.",
    parameters: { type: "object", properties: {} },
  },
];

/* ------------------------------------------------------------------ */
/* connect                                                             */
/* ------------------------------------------------------------------ */

export async function connectDeepgram(opts: {
  locale: Locale;
  chartSummary: string;
  /** The patient's own medications — a closed vocabulary for keyterm prompting. */
  keyterms: string[];
  greeting: string;
  callbacks: DgCallbacks;
}): Promise<DgHandle> {
  const res = await fetch("/api/deepgram-token");
  if (!res.ok) throw new Error("deepgram_unconfigured");
  const { token } = (await res.json()) as { token: string };
  if (!token) throw new Error("deepgram_no_token");

  // Browsers cannot set custom WebSocket headers, so Deepgram accepts the token
  // as a subprotocol pair. The subprotocol NAME encodes the credential type:
  // "token" is for a raw API key, "bearer" for a short-lived JWT from
  // /v1/auth/grant. We mint a JWT, so it must be "bearer" — pairing a JWT with
  // "token" is rejected during the handshake and surfaces only as an opaque
  // 1006 close with no Deepgram error frame.
  const ws = new WebSocket(ENDPOINT, [DG_AUTH_SUBPROTOCOL, token]);
  ws.binaryType = "arraybuffer";

  const player = new Player();
  let isOpen = false;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let userBuf = "";

  const send = (obj: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  /* ---------------- microphone ---------------- */
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const micCtx = new Ctor({ sampleRate: INPUT_RATE });
  const source = micCtx.createMediaStreamSource(stream);
  const node = micCtx.createScriptProcessor(4096, 1, 1);

  node.onaudioprocess = (e) => {
    if (!isOpen || ws.readyState !== WebSocket.OPEN) return;
    ws.send(floatTo16BitPCM(e.inputBuffer.getChannelData(0)));
  };
  source.connect(node);
  node.connect(micCtx.destination);

  ws.onopen = () => {
    isOpen = true;

    send({
      type: "Settings",
      audio: {
        input: { encoding: "linear16", sample_rate: INPUT_RATE },
        output: { encoding: "linear16", sample_rate: OUTPUT_RATE, container: "none" },
      },
      agent: {
        language: "en",
        listen: {
          provider: {
            type: "deepgram",
            // Nova-3 Medical: the medical vocabulary variant. This is the whole
            // reason Deepgram is the English path.
            model: "nova-3-medical",
            // Closed vocabulary of THIS patient's drugs — the most favourable
            // possible condition for keyterm biasing.
            keyterms: opts.keyterms,
          },
        },
        think: {
          provider: { type: "open_ai", model: "gpt-4o-mini" },
          prompt: systemInstruction(opts.locale, opts.chartSummary),
          functions: DG_FUNCTIONS,
        },
        speak: { provider: { type: "deepgram", model: "aura-2-thalia-en" } },
        greeting: opts.greeting,
      },
    });

    keepAlive = setInterval(() => send({ type: "KeepAlive" }), KEEPALIVE_MS);
    opts.callbacks.onOpen?.();
  };

  ws.onmessage = async (ev: MessageEvent) => {
    // Binary frames are agent audio.
    if (ev.data instanceof ArrayBuffer) {
      player.enqueue(ev.data);
      return;
    }

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }

    switch (msg.type) {
      case "UserStartedSpeaking":
        // Barge-in. Kill playback before the next buffer lands.
        player.flush();
        opts.callbacks.onBargeIn();
        break;

      case "ConversationText": {
        const role = String(msg.role ?? "");
        const content = String(msg.content ?? "");
        if (role === "user") {
          userBuf = content;
          opts.callbacks.onUserTranscript(content, true);
        } else if (role === "assistant") {
          opts.callbacks.onAgentTranscript(content, true);
        }
        break;
      }

      case "AgentStartedSpeaking":
        opts.callbacks.onLatency({
          total: Number(msg.total_latency) || undefined,
          tts: Number(msg.tts_latency) || undefined,
          ttt: Number(msg.ttt_latency) || undefined,
        });
        break;

      case "LatencyReport":
        opts.callbacks.onLatency({
          stt: Number(msg.stt_latency) || undefined,
          ttt: Number(msg.ttt_token_latency) || undefined,
          tts: Number(msg.tts_latency) || undefined,
          total: Number(msg.total_latency) || undefined,
        });
        break;

      case "FunctionCallRequest": {
        const fns = (msg.functions ?? []) as {
          id?: string;
          name?: string;
          arguments?: string;
          client_side?: boolean;
        }[];
        for (const fn of fns) {
          // `arguments` arrives as a JSON-ENCODED STRING, not an object.
          let args: Record<string, unknown> = {};
          try {
            args = fn.arguments ? (JSON.parse(fn.arguments) as Record<string, unknown>) : {};
          } catch {
            args = {};
          }

          let result: Record<string, unknown>;
          try {
            result = await opts.callbacks.onToolCall(fn.name ?? "", args);
          } catch (err) {
            result = { error: (err as Error).message };
          }

          // `content` must be a STRING.
          send({
            type: "FunctionCallResponse",
            id: fn.id,
            name: fn.name,
            content: JSON.stringify(result),
          });
        }
        break;
      }

      case "Error":
      case "Warning":
        opts.callbacks.onError?.(`${msg.type}: ${String(msg.description ?? msg.code ?? "")}`);
        break;

      case "InjectionRefused":
        opts.callbacks.onError?.(`injection refused: ${String(msg.message ?? "")}`);
        break;

      default:
        break;
    }
    void userBuf;
  };

  ws.onerror = () => opts.callbacks.onError?.("websocket error");
  ws.onclose = (e) => {
    isOpen = false;
    if (keepAlive) clearInterval(keepAlive);
    player.close();
    opts.callbacks.onClose?.(e.reason || "closed");
  };

  return {
    get open() {
      return isOpen;
    },
    interruptWith(message: string) {
      // Deterministic safety logic outranks the model. This stops it mid-word.
      player.flush();
      send({ type: "InjectAgentMessage", message, behavior: "interrupt" });
    },
    close() {
      isOpen = false;
      if (keepAlive) clearInterval(keepAlive);
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
        ws.close();
      } catch {
        /* already closed */
      }
    },
  };
}
