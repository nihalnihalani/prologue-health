"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrologueSession } from "@/lib/session";
import type { StoryMap } from "@/lib/types";
import type { ChartSlice } from "@/lib/fixtures";
import { Timeline, ItemRow, Reconciliation, BenefitsCard, CallLog, EscalationCard } from "@/components/StoryMap";
import { MARIA_SCRIPT, listen, speak, speechRecognitionCtor, type Listener } from "@/lib/voice";
import { connectLive, chartSummaryFor, voiceForLocale, type LiveHandle } from "@/lib/gemini-live";
import { t, LOCALES, LOCALE_KEYS, isRTL, type Locale } from "@/lib/i18n";
import { checkRedFlags } from "@/lib/clinical";

const STORE_KEY = "prologue:storymap";

type Mode = "gemini" | "browser" | "scripted";
type Turn = { who: "agent" | "patient" | "system"; text: string; barge?: boolean };

export default function PatientPage() {
  const sessionRef = useRef<PrologueSession | null>(null);
  const stopSpeakRef = useRef<() => void>(() => {});
  const listenerRef = useRef<Listener | null>(null);
  const liveRef = useRef<LiveHandle | null>(null);
  const chartRef = useRef<ChartSlice | null>(null);

  const [locale, setLocale] = useState<Locale>("en");
  const [map, setMap] = useState<StoryMap | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [consented, setConsented] = useState(false);
  const [mode, setMode] = useState<Mode>("scripted");
  const [geminiAvailable, setGeminiAvailable] = useState(false);
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

      const gem = await fetch("/api/gemini-token").then((r) => r.ok).catch(() => false);
      setGeminiAvailable(gem);
      setMode(gem ? "gemini" : speechRecognitionCtor() ? "browser" : "scripted");
    })();
    return () => liveRef.current?.close();
  }, [sync]);

  /* ---- changing language restarts the session cleanly ---- */
  const changeLocale = (next: Locale) => {
    setLocale(next);
    liveRef.current?.close();
    liveRef.current = null;
    setLiveState("idle");
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

  /* ---- Gemini Live ---- */
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
          onToolCall: async (name, args) => {
            const sess = sessionRef.current!;
            switch (name) {
              case "check_red_flags": {
                const flag = checkRedFlags(String(args.transcript ?? ""));
                return flag
                  ? { escalate: true, rule: flag.ruleId, instruction: t(locale, flag.patientKey ?? "escalateGeneric") }
                  : { escalate: false };
              }
              case "get_relevant_medications":
                return {
                  medications: chart.medications.map((m) => ({
                    name: m.name,
                    startedDaysAgo: m.startedDaysAgo,
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
                  deductibleRemaining: j.benefits.deductibleRemaining,
                  note: "Benefits only. Do not state a total price.",
                };
              }
              case "save_confirmed_statement":
                return { saved: true, status: "draft" };
              default:
                return { error: "unknown tool" };
            }
          },
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
    if (mode === "gemini") {
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

  return (
    <main dir={rtl ? "rtl" : "ltr"} style={{ maxWidth: 560, margin: "0 auto", padding: "18px 16px 120px" }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 21, letterSpacing: "-.02em" }}>Prologue</h1>
        <Link href="/clinician" className="chip" style={{ marginInlineStart: "auto", textDecoration: "none" }}>
          Clinician view →
        </Link>
      </header>

      {/* ---------- language ---------- */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
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
        <span className={`chip ${geminiAvailable ? "live" : "sim"}`}>
          {mode === "gemini" ? `Gemini Live · ${liveState}` : mode === "browser" ? "browser mic" : "scripted"}
        </span>
        <span className="chip sim">synthetic</span>
      </div>

      {/* ---------- consent gate ---------- */}
      {!consented ? (
        <section className="card">
          <header><h2>{t(locale, "consentTitle")}</h2></header>
          <div className="body">
            <p style={{ marginTop: 0, fontSize: 15 }}>{t(locale, "consentBody")}</p>
            <ul style={{ fontSize: 14, color: "var(--ink-2)", paddingInlineStart: 20 }}>
              <li>{t(locale, "consentBullet1")}</li>
              <li>{t(locale, "consentBullet2")}</li>
              <li>{t(locale, "consentBullet3")}</li>
            </ul>
            <button className="btn primary big" onClick={grantConsent} style={{ width: "100%", marginTop: 8 }}>
              {t(locale, "consentAccept")}
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="card" style={{ marginBottom: 14 }}>
            <header>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--crit)" }} />
              <h2>{t(locale, "recording")}</h2>
              <span className="chip" style={{ marginInlineStart: "auto" }}>{LOCALES[locale].bcp47}</span>
            </header>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, maxHeight: 320, overflowY: "auto" }}>
              {turns.map((turn, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: turn.who === "patient" ? "flex-end" : "flex-start", gap: 3 }}>
                  <span className="mono" style={{ fontSize: 9.5, letterSpacing: ".09em", textTransform: "uppercase", color: turn.who === "agent" ? "var(--accent)" : "var(--ink-3)" }}>
                    {turn.who === "agent" ? "Prologue" : turn.who === "patient" ? t(locale, "srcPatient") : "System"}
                  </span>
                  <div
                    style={{
                      padding: "9px 12px", borderRadius: 13, fontSize: 14.5, maxWidth: "88%",
                      background: turn.who === "agent" ? "var(--accent-2)" : turn.who === "system" ? "transparent" : "var(--surface-2)",
                      border: turn.who === "system" ? "1px dashed var(--line)" : "none",
                      color: turn.who === "system" ? "var(--ink-3)" : "var(--ink)",
                      fontFamily: turn.who === "system" ? "var(--mono)" : "inherit",
                    }}
                  >
                    {turn.text}
                  </div>
                </div>
              ))}
              {partial && (
                <div style={{ alignSelf: "flex-end", padding: "9px 12px", borderRadius: 13, background: "var(--surface-2)", opacity: 0.6, fontSize: 14.5 }}>
                  {partial}…
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--line-soft)", flexWrap: "wrap" }}>
              {mode === "gemini" && liveState === "live" && (
                <span className="chip live" style={{ flex: 1, textAlign: "center", padding: "10px" }}>
                  🎙 Listening — just speak
                </span>
              )}
              {mode === "browser" && (
                <button className={`btn ${micLive ? "danger" : "primary"} big`} onClick={toggleMic} disabled={busy} style={{ flex: 1 }}>
                  {micLive ? t(locale, "stopButton") : `🎤 ${t(locale, "speakButton")}`}
                </button>
              )}
              <button className="btn big" onClick={nextScripted} disabled={busy || scriptIdx >= MARIA_SCRIPT.length} style={{ flex: 1 }}>
                {scriptIdx >= MARIA_SCRIPT.length ? "Script complete" : `Play scripted line (${scriptIdx + 1}/${MARIA_SCRIPT.length})`}
              </button>
            </div>
          </section>

          {map.escalation && <div style={{ marginBottom: 14 }}><EscalationCard map={map} audience="patient" /></div>}

          {map.timeline && (
            <section className="card" style={{ marginBottom: 14 }}>
              <header><h2>{t(locale, "labelWhyFlagged")}</h2></header>
              <Timeline model={map.timeline} audience="patient" />
            </section>
          )}

          {map.reconciliation.length > 0 && (
            <section className="card" style={{ marginBottom: 14 }}>
              <header><h2>{t(locale, "labelMeds")}</h2></header>
              <Reconciliation rows={map.reconciliation} />
            </section>
          )}

          {map.benefits && (
            <section className="card" style={{ marginBottom: 14 }}>
              <header>
                <h2>{t(locale, "labelCoverage")}</h2>
                <span className={`chip ${map.benefits.simulated ? "sim" : "live"}`} style={{ marginInlineStart: "auto" }}>
                  {map.benefits.simulated ? "fixture" : "live 270/271"}
                </span>
              </header>
              <BenefitsCard b={map.benefits} />
            </section>
          )}

          <section className="card" style={{ marginBottom: 14 }}>
            <header><h2>{t(locale, "labelHeard")}</h2></header>
            <div>
              {patientItems.map((i) => <ItemRow key={i.id} item={i} audience="patient" locale={locale} />)}
            </div>
            <div className="disc" style={{ margin: 14 }}>{t(locale, "labelDraft")}</div>
          </section>

          <section className="card">
            <header>
              <h2>Under the hood</h2>
              <span className="chip" style={{ marginInlineStart: "auto" }}>chart warm {backend?.warmMs ?? "–"} ms · {backend?.chart}</span>
            </header>
            <CallLog calls={map.calls} />
          </section>

          {done && (
            <div style={{ marginTop: 14, textAlign: "center" }}>
              <Link href="/clinician" className="btn primary big" style={{ textDecoration: "none", display: "inline-block" }}>
                Open clinician review →
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}
