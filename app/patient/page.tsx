"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Play, Check, AlertCircle, AlertTriangle, ChevronRight, Settings } from "lucide-react";
import { PrologueSession } from "@/lib/session";
import type { StoryMap } from "@/lib/types";
import type { ChartSlice } from "@/lib/fixtures";
import { Timeline, ItemRow, Reconciliation, BenefitsCard, CallLog, EscalationCard } from "@/components/StoryMap";
import { MARIA_SCRIPT, listen, speak, speechRecognitionCtor, type Listener } from "@/lib/voice";
import { connectLive, chartSummaryFor, voiceForLocale, type LiveHandle } from "@/lib/gemini-live";
import { connectDeepgram, type DgHandle, type DgLatency } from "@/lib/deepgram-live";
import { t, LOCALES, LOCALE_KEYS, isRTL, type Locale } from "@/lib/i18n";
import { checkRedFlags } from "@/lib/clinical";

const STORE_KEY = "prologue:storymap";

/**
 * Voice routing.
 *   deepgram — ENGLISH. Nova-3 Medical + keyterm prompting over this patient's
 *              own drug list. Drug-name accuracy is the biggest live risk and
 *              this is the strongest mitigation in the stack.
 *   gemini   — EVERY OTHER LANGUAGE. Native audio detects and switches language
 *              automatically; Deepgram would need the language declared.
 *   browser  — Web Speech API. A real mic, no credentials.
 *   scripted — deterministic. The demo guarantee.
 */
type Mode = "deepgram" | "gemini" | "browser" | "scripted";
type Turn = { who: "agent" | "patient" | "system"; text: string; barge?: boolean };

/**
 * English goes to Deepgram for medical-vocabulary accuracy; every other language
 * goes to Gemini, whose native-audio models detect and switch language on their
 * own. Falls back to a real browser microphone, then to the deterministic script.
 */
function pickMode(locale: Locale, deepgram: boolean, gemini: boolean): Mode {
  if (locale === "en" && deepgram) return "deepgram";
  if (locale !== "en" && gemini) return "gemini";
  if (deepgram && locale === "en") return "deepgram";
  if (gemini) return "gemini";
  return speechRecognitionCtor() ? "browser" : "scripted";
}

export default function PatientPage() {
  const sessionRef = useRef<PrologueSession | null>(null);
  const stopSpeakRef = useRef<() => void>(() => {});
  const listenerRef = useRef<Listener | null>(null);
  const liveRef = useRef<LiveHandle | null>(null);
  const dgRef = useRef<DgHandle | null>(null);
  const chartRef = useRef<ChartSlice | null>(null);

  const [locale, setLocale] = useState<Locale>("en");
  const [map, setMap] = useState<StoryMap | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [consented, setConsented] = useState(false);
  const [mode, setMode] = useState<Mode>("scripted");
  const [available, setAvailable] = useState({ deepgram: false, gemini: false });
  const [dgLatency, setDgLatency] = useState<DgLatency | null>(null);
  const [liveState, setLiveState] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [micLive, setMicLive] = useState(false);
  const [partial, setPartial] = useState("");
  const [scriptIdx, setScriptIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState<{ chart: string; warmMs: number } | null>(null);
  const [done, setDone] = useState(false);

  const rtl = isRTL(locale);

  const sync = useCallback((m: StoryMap) => {
    setMap({ ...m });
    // Server store first: the demo is a phone for the patient and a laptop for
    // the clinician, so localStorage alone cannot carry it. localStorage stays
    // as a same-browser fallback if the POST fails.
    void fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...m, patientId: m.patient.id }),
    }).catch(() => {});
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(m));
    } catch {
      /* private mode */
    }
  }, []);

  /* ---- boot: warm the chart, detect capabilities ---- */
  useEffect(() => {
    (async () => {
      const nav = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en";
      const detected = (LOCALE_KEYS as string[]).includes(nav) ? (nav as Locale) : "en";
      setLocale(detected);

      const s = new PrologueSession(`sess-${Date.now()}`, detected);
      sessionRef.current = s;
      try {
        const res = await fetch("/api/chart");
        const j = (await res.json()) as { chart: ChartSlice; ms: number; simulated: boolean; backend: string };
        chartRef.current = j.chart;
        s.attachChart(j.chart, j.ms, j.simulated);
        setBackend({ chart: j.backend, warmMs: j.ms });
      } catch {
        setBackend({ chart: "unavailable", warmMs: 0 });
      }
      sync(s.map);

      const [dg, gem] = await Promise.all([
        fetch("/api/deepgram-token").then((r) => r.ok).catch(() => false),
        fetch("/api/gemini-token").then((r) => r.ok).catch(() => false),
      ]);
      setAvailable({ deepgram: dg, gemini: gem });
      setMode(pickMode(detected, dg, gem));
    })();
    return () => {
      liveRef.current?.close();
      dgRef.current?.close();
    };
  }, [sync]);

  /* ---- changing language restarts the session cleanly ---- */
  const changeLocale = (next: Locale) => {
    setLocale(next);
    liveRef.current?.close();
    liveRef.current = null;
    dgRef.current?.close();
    dgRef.current = null;
    setDgLatency(null);
    setLiveState("idle");
    setMode(pickMode(next, available.deepgram, available.gemini));
    const s = new PrologueSession(`sess-${Date.now()}`, next);
    if (chartRef.current) s.attachChart(chartRef.current, backend?.warmMs ?? 0, true);
    sessionRef.current = s;
    setTurns([]);
    setScriptIdx(0);
    setConsented(false);
    setDone(false);
    sync(s.map);
  };

  const say = useCallback((text: string, speakIt = true) => {
    setTurns((t) => [...t, { who: "agent", text }]);
    if (speakIt) stopSpeakRef.current = speak(text);
  }, []);

  /* ---- the one path every mode funnels into ---- */
  const handlePatientUtterance = useCallback(
    async (text: string, atSeconds: number, kind?: string, speakReply = true) => {
      const s = sessionRef.current;
      if (!s || !text.trim()) return;
      setBusy(true);
      setPartial("");
      stopSpeakRef.current();

      setTurns((t) => [...t, { who: "patient", text }]);

      if (kind === "recon") {
        s.reconcile(["lamotrigine", "divalproex"], ["furosemide"]);
        sync(s.map);
        say(t(locale, "reconAck"), speakReply);
        setBusy(false);
        return;
      }
      if (kind === "doorknob") {
        s.addDoorknob(text, atSeconds);
        sync(s.map);
        say(t(locale, "doorknobAck"), speakReply);
        setDone(true);
        setBusy(false);
        return;
      }

      const r = s.patientSaid(text, atSeconds);
      sync(s.map);
      say(r.agentSays, speakReply);

      if (r.escalated) {
        setTurns((t) => [...t, { who: "system", text: "Escalation raised — routed to the clinic" }]);
        try {
          const res = await fetch("/api/eligibility", { method: "POST" });
          const j = await res.json();
          s.attachBenefits(j.benefits, j.ms);
          sync(s.map);
        } catch {
          setTurns((t) => [...t, { who: "system", text: "Couldn't reach the insurer — the office will check" }]);
        }
      }
      setBusy(false);
    },
    [say, sync, locale]
  );

  /**
   * Tool handler shared by both transports. The engine owns the reasoning;
   * the voice provider only supplies words.
   */
  const handleTool = useCallback(
    async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const sess = sessionRef.current;
      const chart = chartRef.current;
      if (!sess || !chart) return { error: "session not ready" };

      switch (name) {
        case "check_red_flags": {
          const flag = checkRedFlags(String(args.transcript ?? ""));
          if (!flag) return { escalate: false };
          const spoken = t(locale, flag.patientKey ?? "escalateGeneric");
          // Deterministic safety outranks the model: cut it off mid-word rather
          // than hoping it chooses to follow the instruction.
          dgRef.current?.interruptWith(spoken);
          return { escalate: true, rule: flag.ruleId, severity: flag.severity, say_exactly: spoken };
        }
        case "get_relevant_medications":
          return {
            medications: chart.medications.map((m) => ({
              name: m.name,
              started_days_ago: m.startedDaysAgo,
              dosage: m.dosage,
            })),
          };
        case "run_eligibility_check": {
          const res = await fetch("/api/eligibility", { method: "POST" });
          const j = await res.json();
          sess.attachBenefits(j.benefits, j.ms);
          sync(sess.map);
          return {
            active: j.benefits.active,
            copays: j.benefits.copays,
            deductible_remaining: j.benefits.deductibleRemaining,
            note: "Benefits only. Never state a total price.",
          };
        }
        case "save_confirmed_statement":
          return { saved: true, status: "draft" };
        default:
          return { error: "unknown tool" };
      }
    },
    [locale, sync]
  );

  /* ---- Deepgram Voice Agent (English) ---- */
  const startDeepgram = async () => {
    const s = sessionRef.current;
    const chart = chartRef.current;
    if (!s || !chart) return;
    setLiveState("connecting");
    try {
      dgRef.current = await connectDeepgram({
        locale,
        chartSummary: chartSummaryFor(chart.medications, chart.conditions.map((c) => c.text)),
        // Closed vocabulary: this patient's own drugs.
        keyterms: [
          ...chart.medications.map((m) => m.name),
          "lamotrigine",
          "divalproex",
          "furosemide",
          "rash",
          "mucosal",
          "blistering",
        ],
        greeting: s.opening(),
        callbacks: {
          onOpen: () => setLiveState("live"),
          onClose: () => setLiveState("idle"),
          onError: (m) => {
            console.error("[deepgram]", m);
            setLiveState("error");
          },
          onLatency: (l) => setDgLatency(l),
          onBargeIn: () =>
            setTurns((prev) => [...prev, { who: "system", text: "— patient interrupted —" }]),
          onUserTranscript: (text, isFinal) => {
            if (!isFinal) return setPartial(text);
            setPartial("");
            void handlePatientUtterance(text, Math.round(performance.now() / 1000), undefined, false);
          },
          onAgentTranscript: (text, isFinal) => {
            if (isFinal) setTurns((prev) => [...prev, { who: "agent", text }]);
          },
          onToolCall: handleTool,
        },
      });
    } catch (err) {
      console.error(err);
      setLiveState("error");
      setMode(speechRecognitionCtor() ? "browser" : "scripted");
    }
  };

  /* ---- Gemini Live (non-English) ---- */
  const startLive = async () => {
    const s = sessionRef.current;
    const chart = chartRef.current;
    if (!s || !chart) return;
    setLiveState("connecting");
    try {
      const handle = await connectLive({
        locale,
        voiceName: voiceForLocale(locale),
        chartSummary: chartSummaryFor(chart.medications, chart.conditions.map((c) => c.text)),
        callbacks: {
          onOpen: () => setLiveState("live"),
          onClose: () => setLiveState("idle"),
          onError: (m) => {
            console.error("[live]", m);
            setLiveState("error");
          },
          onUserTranscript: (text, isFinal) => {
            if (!isFinal) return setPartial(text);
            setPartial("");
            // The engine still owns the reasoning — Gemini supplies the words.
            void handlePatientUtterance(text, Math.round(performance.now() / 1000), undefined, false);
          },
          onAgentTranscript: (text, isFinal) => {
            if (isFinal) setTurns((t) => [...t, { who: "agent", text }]);
          },
          onInterrupted: () => {
            setTurns((t) => [...t, { who: "system", text: "— patient interrupted —" }]);
          },
          onToolCall: handleTool,
        },
      });
      liveRef.current = handle;
    } catch (err) {
      console.error(err);
      setLiveState("error");
      setMode(speechRecognitionCtor() ? "browser" : "scripted");
    }
  };

  const grantConsent = () => {
    const s = sessionRef.current;
    if (!s) return;
    s.grantConsent();
    setConsented(true);
    sync(s.map);
    if (mode === "deepgram") {
      void startDeepgram();       // the greeting is spoken by the agent itself
    } else if (mode === "gemini") {
      void startLive();
    } else {
      say(s.opening());
    }
  };

  const toggleMic = () => {
    if (micLive) {
      listenerRef.current?.stop();
      setMicLive(false);
      return;
    }
    const l = listen({
      onPartial: setPartial,
      onFinal: (txt) => {
        setMicLive(false);
        void handlePatientUtterance(txt, Math.round(performance.now() / 1000));
      },
      onError: () => setMicLive(false),
    });
    if (!l) return setMode("scripted");
    listenerRef.current = l;
    l.start();
    setMicLive(true);
  };

  const nextScripted = () => {
    const turn = MARIA_SCRIPT[scriptIdx];
    if (!turn) return;
    setScriptIdx((i) => i + 1);
    void handlePatientUtterance(turn.say, turn.at, turn.kind);
  };

  if (!map) return <main style={{ padding: 40 }} className="mono muted">Loading chart…</main>;

  const patientItems = map.items.filter((i) => i.patientText);

  const cardVariants: any = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
  };

  return (
    <motion.main 
      initial={false} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
      dir={rtl ? "rtl" : "ltr"} 
      style={{ maxWidth: 560, margin: "0 auto", padding: "18px 16px 120px" }}
    >
      <header style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-.02em", fontWeight: 700 }}>Prologue</h1>
        <Link href="/clinician" className="chip" style={{ marginInlineStart: "auto", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
          Clinician view <ChevronRight size={12} />
        </Link>
      </header>

      {/* ---------- language ---------- */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <Settings size={14} className="muted" />
        <label htmlFor="locale" className="mono" style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3)" }}>
          Language
        </label>
        <select
          id="locale"
          name="locale"
          value={locale}
          onChange={(e) => changeLocale(e.target.value as Locale)}
          style={{ padding: "6px 9px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontSize: 14 }}
        >
          {LOCALE_KEYS.map((l) => (
            <option key={l} value={l}>
              {LOCALES[l].native} — {LOCALES[l].label}
            </option>
          ))}
        </select>
        <span className={`chip ${mode === "deepgram" || mode === "gemini" ? "live" : "sim"}`}>
          {mode === "deepgram"
            ? `Deepgram nova-3-medical · ${liveState}`
            : mode === "gemini"
              ? `Gemini Live · ${liveState}`
              : mode === "browser"
                ? "browser mic"
                : "scripted"}
        </span>
        {dgLatency?.total != null && (
          <span className="chip live" title="Measured on the wire by Deepgram, not estimated">
            {Math.round(dgLatency.total)} ms turn
            {dgLatency.stt != null && ` · stt ${Math.round(dgLatency.stt)}`}
            {dgLatency.tts != null && ` · tts ${Math.round(dgLatency.tts)}`}
          </span>
        )}
        <span className="chip sim">synthetic</span>
      </div>

      {/* ---------- consent gate ---------- */}
      {!consented ? (
        <motion.section variants={cardVariants} initial="hidden" animate="visible" className="card">
          <header><h2>{t(locale, "consentTitle")}</h2></header>
          <div className="body">
            <p style={{ marginTop: 0, fontSize: 15 }}>{t(locale, "consentBody")}</p>
            <ul style={{ fontSize: 14, color: "var(--ink-2)", paddingInlineStart: 20 }}>
              <li>{t(locale, "consentBullet1")}</li>
              <li>{t(locale, "consentBullet2")}</li>
              <li>{t(locale, "consentBullet3")}</li>
            </ul>
            {locale !== "en" ? (
              <div style={{ fontSize: 13, color: "var(--warn)", background: "var(--warn-bg)", padding: "10px 14px", borderRadius: 4, marginTop: 12 }}>
                ⚠️ <strong>Language Notice</strong>: Automated safety checking rules are only validated for English. For non-English transcripts, safety screening is not automatically guaranteed and requires manual clinician review.
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--provenance-patient-fg)", background: "var(--provenance-patient-bg)", padding: "10px 14px", borderRadius: 4, marginTop: 12 }}>
                ✅ Deterministic safety screening rules are fully active and validated for this English session.
              </div>
            )}
            <button className="btn primary big" onClick={grantConsent} style={{ width: "100%", marginTop: 12 }}>
              {t(locale, "consentAccept")}
            </button>
          </div>
        </motion.section>
      ) : (
        <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }}>
          <motion.section variants={cardVariants} className="card" style={{ marginBottom: 14 }}>
            <header>
              {(micLive || liveState === "live") && (
                <motion.span 
                  animate={{ opacity: [1, 0.5, 1] }} 
                  transition={{ duration: 2, repeat: Infinity }}
                  aria-hidden="true" 
                  style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--crit)" }} 
                />
              )}
              <h2>{micLive || liveState === "live" ? t(locale, "recording") : "Intake Session"}</h2>
              <span className="chip" style={{ marginInlineStart: "auto" }}>{LOCALES[locale].bcp47}</span>
            </header>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto" }}>
              <AnimatePresence initial={false}>
                {turns.map((turn, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    style={{ display: "flex", flexDirection: "column", alignItems: turn.who === "patient" ? "flex-end" : "flex-start", gap: 3 }}
                  >
                    <span className="mono" style={{ fontSize: 9.5, letterSpacing: ".09em", textTransform: "uppercase", color: turn.who === "agent" ? "var(--accent)" : "var(--ink-3)" }}>
                      {turn.who === "agent" ? "Prologue" : turn.who === "patient" ? t(locale, "srcPatient") : "System"}
                    </span>
                    <div
                      style={{
                        padding: "10px 14px", borderRadius: 14, fontSize: 14.5, maxWidth: "88%",
                        background: turn.who === "agent" ? "var(--accent-2)" : turn.who === "system" ? "transparent" : "var(--surface-2)",
                        border: turn.who === "system" ? "1px dashed var(--line)" : "none",
                        color: turn.who === "system" ? "var(--ink-3)" : "var(--ink)",
                        fontFamily: turn.who === "system" ? "var(--mono)" : "inherit",
                        borderBottomLeftRadius: turn.who === "agent" ? 4 : 14,
                        borderBottomRightRadius: turn.who === "patient" ? 4 : 14,
                      }}
                    >
                      {turn.text}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {partial && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ alignSelf: "flex-end", padding: "10px 14px", borderRadius: 14, borderBottomRightRadius: 4, background: "var(--surface-2)", opacity: 0.7, fontSize: 14.5 }}>
                  <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>...</motion.span> {partial}
                </motion.div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--line-soft)", flexWrap: "wrap", background: "var(--surface-2)" }}>
              {liveState === "error" && (
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, padding: 4 }}>
                  <div style={{ fontSize: 13.5, color: "var(--crit)", background: "var(--crit-bg)", padding: "10px 14px", borderRadius: 4, display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                    <AlertTriangle size={16} /> Live voice agent connection failed (WebSocket error)
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                    <button className="btn primary" style={{ flex: 1, padding: "8px 12px", fontSize: 12 }} onClick={() => { setMode("browser"); setLiveState("idle"); }}>
                      🎤 Use Browser Mic fallback
                    </button>
                    <button className="btn" style={{ flex: 1, padding: "8px 12px", fontSize: 12 }} onClick={() => { setMode("scripted"); setLiveState("idle"); }}>
                      ▶️ Use Scripted Demo fallback
                    </button>
                  </div>
                </div>
              )}
              {liveState === "connecting" && (
                <span className="chip live" style={{ flex: 1, textAlign: "center", padding: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, background: "var(--provenance-inference-bg)", borderColor: "var(--provenance-inference-fg)", color: "var(--provenance-inference-fg)" }}>
                  <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>🔄</motion.span> Connecting to live voice agent...
                </span>
              )}
              {(mode === "deepgram" || mode === "gemini") && liveState === "live" && (
                <span className="chip live" style={{ flex: 1, textAlign: "center", padding: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13 }}>
                  <Mic size={14} /> Listening — just speak
                </span>
              )}
              {mode === "browser" && liveState !== "error" && (
                <button className={`btn ${micLive ? "danger" : "primary"} big`} onClick={toggleMic} disabled={busy} style={{ flex: 1 }}>
                  {micLive ? <><MicOff size={16}/> {t(locale, "stopButton")}</> : <><Mic size={16}/> {t(locale, "speakButton")}</>}
                </button>
              )}
              {mode === "scripted" && liveState !== "error" && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, alignItems: "center", justifyContent: "center", padding: "6px 0" }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    Scripted Session · expand diagnostics disclosure below to play
                  </span>
                </div>
              )}
            </div>
          </motion.section>

          {map.escalation && <motion.div variants={cardVariants} style={{ marginBottom: 14 }}><EscalationCard map={map} audience="patient" /></motion.div>}

          {map.timeline && (
            <motion.section variants={cardVariants} className="card" style={{ marginBottom: 14 }}>
              <header><h2>{t(locale, "labelWhyFlagged")}</h2></header>
              <Timeline model={map.timeline} audience="patient" />
            </motion.section>
          )}

          {map.reconciliation.length > 0 && (
            <motion.section variants={cardVariants} className="card" style={{ marginBottom: 14 }}>
              <header><h2>{t(locale, "labelMeds")}</h2></header>
              <Reconciliation rows={map.reconciliation} />
            </motion.section>
          )}

          {map.benefits && (
            <motion.section variants={cardVariants} className="card" style={{ marginBottom: 14 }}>
              <header>
                <h2>{t(locale, "labelCoverage")}</h2>
                <span className={`chip ${map.benefits.simulated ? "sim" : "live"}`} style={{ marginInlineStart: "auto" }}>
                  {map.benefits.simulated ? "fixture" : "live 270/271"}
                </span>
              </header>
              <BenefitsCard b={map.benefits} />
            </motion.section>
          )}

          <motion.section variants={cardVariants} className="card" style={{ marginBottom: 14 }}>
            <header><h2>{t(locale, "labelHeard")}</h2></header>
            <div>
              {patientItems.map((i) => <ItemRow key={i.id} item={i} audience="patient" locale={locale} />)}
            </div>
            <div className="disc" style={{ margin: 14 }}>{t(locale, "labelDraft")}</div>
          </motion.section>

          <details style={{ marginTop: 24, padding: "14px", border: "1px dashed var(--line)", borderRadius: "var(--r)", background: "var(--surface-2)" }}>
            <summary className="mono" style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--ink-2)", outline: "none" }}>
              Demo Controls & Developer Diagnostics
            </summary>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn big" onClick={nextScripted} disabled={busy || scriptIdx >= MARIA_SCRIPT.length} style={{ flex: 1 }}>
                  <Play size={16} />
                  {scriptIdx >= MARIA_SCRIPT.length ? "Script complete" : `Play scripted line (${scriptIdx + 1}/${MARIA_SCRIPT.length})`}
                </button>
              </div>

              <motion.section variants={cardVariants} className="card">
                <header>
                  <h2>Under the hood</h2>
                  <span className="chip" style={{ marginInlineStart: "auto" }}>chart warm {backend?.warmMs ?? "–"} ms · {backend?.chart}</span>
                </header>
                <CallLog calls={map.calls} />
              </motion.section>
            </div>
          </details>

          {done && (
            <motion.div variants={cardVariants} style={{ marginTop: 24, textAlign: "center" }}>
              <Link href="/clinician" className="btn primary big" style={{ textDecoration: "none", display: "inline-flex", gap: 8, alignItems: "center" }}>
                Open clinician review <ChevronRight size={16} />
              </Link>
            </motion.div>
          )}
        </motion.div>
      )}
    </motion.main>
  );
}
