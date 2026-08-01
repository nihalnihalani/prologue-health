/**
 * Voice input, three modes — all of which drive the identical PrologueSession.
 *
 *   deepgram : Deepgram Voice Agent via short-lived token (best; needs a key)
 *   browser  : Web Speech API — a REAL microphone with no credentials at all
 *   scripted : deterministic playback, zero dependencies (the demo guarantee)
 *
 * In every mode the patient's WORDS are the only thing that differs. The chart
 * read, the correlation, the red-flag evaluation and the question the agent asks
 * are computed by the engine either way — so the fallback is honest, not a mock.
 */

export type VoiceMode = "deepgram" | "browser" | "scripted";

export async function detectBestMode(): Promise<VoiceMode> {
  try {
    const res = await fetch("/api/deepgram-token");
    if (res.ok) {
      const { token } = await res.json();
      if (token) return "deepgram";
    }
  } catch {
    /* fall through */
  }
  if (typeof window !== "undefined" && speechRecognitionCtor()) return "browser";
  return "scripted";
}

/* ---------------- Web Speech API ---------------- */

type SRCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function speechRecognitionCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface Listener {
  start(): void;
  stop(): void;
}

/** Listen for one complete utterance and hand it to `onFinal`. */
export function listen(opts: {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (msg: string) => void;
}): Listener | null {
  const Ctor = speechRecognitionCtor();
  if (!Ctor) return null;

  const rec = new Ctor();
  rec.continuous = false;
  rec.interimResults = true;
  rec.lang = "en-US";

  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const text = r[0]?.transcript ?? "";
      if (r.isFinal) {
        opts.onFinal(text.trim());
        return;
      }
      interim += text;
    }
    if (interim) opts.onPartial(interim.trim());
  };
  rec.onerror = (e) => opts.onError(e.error);

  return {
    start: () => {
      try {
        rec.start();
      } catch {
        /* already started */
      }
    },
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}

/* ---------------- Speech synthesis for the agent ---------------- */

export function speak(text: string, onDone?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onDone?.();
    return () => {};
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  u.pitch = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((v) => /samantha|karen|female|google us/i.test(v.name)) ?? voices[0];
  if (preferred) u.voice = preferred;
  u.onend = () => onDone?.();
  u.onerror = () => onDone?.();
  window.speechSynthesis.speak(u);
  // Returned function supports barge-in: calling it stops the agent mid-word.
  return () => window.speechSynthesis.cancel();
}

/* ---------------- The scripted patient ---------------- */

export interface ScriptTurn {
  say: string;
  /** Seconds into the session, for transcript playback in the clinician view. */
  at: number;
  /** Marks the turn that interrupts the agent. */
  barge?: boolean;
  kind?: "answer" | "confirm" | "recon" | "doorknob";
}

/**
 * Maria's side of the conversation.
 *
 * Only these strings are canned. Everything the agent says back is computed.
 */
export const MARIA_SCRIPT: ScriptTurn[] = [
  { say: "I've got this rash. It's on both arms and some on my chest. Itchy. Maybe four days?", at: 63, kind: "answer" },
  { say: "Yeah, my psychiatrist added it last month.", at: 98, kind: "confirm" },
  { say: "Oh — my mouth's been sore too.", at: 121, barge: true, kind: "answer" },
  { say: "The first two, yeah. But I stopped the furosemide months ago.", at: 187, kind: "recon" },
  { say: "I guess I've been really tired. But that's probably nothing.", at: 232, kind: "doorknob" },
];
