"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrologueSession } from "@/lib/session";
import type { StoryMap } from "@/lib/types";
import type { ChartSlice } from "@/lib/fixtures";
import { Timeline, ItemRow, Reconciliation, BenefitsCard, CallLog, EscalationCard } from "@/components/StoryMap";
import { MARIA_SCRIPT, listen, speak, speechRecognitionCtor, type VoiceMode, type Listener } from "@/lib/voice";

const STORE_KEY = "prologue:storymap";

type Turn = { who: "agent" | "patient" | "system"; text: string; barge?: boolean };

export default function PatientPage() {
  const sessionRef = useRef<PrologueSession | null>(null);
  const stopSpeakRef = useRef<() => void>(() => {});
  const listenerRef = useRef<Listener | null>(null);

  const [map, setMap] = useState<StoryMap | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [consented, setConsented] = useState(false);
  const [mode, setMode] = useState<VoiceMode>("scripted");
  const [micLive, setMicLive] = useState(false);
  const [partial, setPartial] = useState("");
  const [scriptIdx, setScriptIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState<{ chart: string; warmMs: number } | null>(null);
  const [done, setDone] = useState(false);

  const sync = useCallback((m: StoryMap) => {
    setMap({ ...m });
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(m));
    } catch {
      /* private mode */
    }
  }, []);

  /* ---- boot: warm the chart before anything else ---- */
  useEffect(() => {
    (async () => {
      const s = new PrologueSession(`sess-${Date.now()}`);
      sessionRef.current = s;
      try {
        const res = await fetch("/api/chart");
        const j = (await res.json()) as { chart: ChartSlice; ms: number; simulated: boolean; backend: string };
        s.attachChart(j.chart, j.ms, j.simulated);
        setBackend({ chart: j.backend, warmMs: j.ms });
      } catch {
        setBackend({ chart: "unavailable", warmMs: 0 });
      }
      sync(s.map);
      setMode(speechRecognitionCtor() ? "browser" : "scripted");
    })();
  }, [sync]);

  const say = useCallback(
    (text: string) => {
      setTurns((t) => [...t, { who: "agent", text }]);
      stopSpeakRef.current = speak(text);
    },
    []
  );

  const grantConsent = () => {
    const s = sessionRef.current;
    if (!s) return;
    s.grantConsent();
    setConsented(true);
    sync(s.map);
    say("Thanks. So — what's going on that brought you in?");
  };

  /* ---- the one path every mode funnels into ---- */
  const handlePatientUtterance = useCallback(
    async (text: string, atSeconds: number, kind?: string) => {
      const s = sessionRef.current;
      if (!s || !text.trim()) return;
      setBusy(true);
      setPartial("");
      stopSpeakRef.current(); // barge-in: patient speaking stops the agent mid-word

      setTurns((t) => [...t, { who: "patient", text }]);

      if (kind === "recon") {
        s.reconcile(["lamotrigine", "divalproex"], ["furosemide"]);
        sync(s.map);
        say("Good to know — I'll flag that so Dr. Osei can update it. I'm not able to change your list myself.");
        setBusy(false);
        return;
      }
      if (kind === "doorknob") {
        s.addDoorknob(text, atSeconds);
        sync(s.map);
        say("Thank you for telling me. I've put that at the top for Dr. Osei.");
        setDone(true);
        setBusy(false);
        return;
      }

      const r = s.patientSaid(text, atSeconds);
      sync(s.map);
      say(r.agentSays);

      if (r.escalated) {
        setTurns((t) => [...t, { who: "system", text: "Escalation raised — routed to the clinic" }]);
        // Coverage is checked BECAUSE the visit moved up. One narrative, not two features.
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
    [say, sync]
  );

  /* ---- mic ---- */
  const toggleMic = () => {
    if (micLive) {
      listenerRef.current?.stop();
      setMicLive(false);
      return;
    }
    const l = listen({
      onPartial: setPartial,
      onFinal: (t) => {
        setMicLive(false);
        handlePatientUtterance(t, Math.round(performance.now() / 1000));
      },
      onError: () => setMicLive(false),
    });
    if (!l) {
      setMode("scripted");
      return;
    }
    listenerRef.current = l;
    l.start();
    setMicLive(true);
  };

  const nextScripted = () => {
    const turn = MARIA_SCRIPT[scriptIdx];
    if (!turn) return;
    setScriptIdx((i) => i + 1);
    handlePatientUtterance(turn.say, turn.at, turn.kind);
  };

  if (!map) return <main style={{ padding: 40 }} className="mono muted">Loading chart…</main>;

  const patientItems = map.items.filter((i) => i.patientText);

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "18px 16px 120px" }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 21, letterSpacing: "-.02em" }}>Prologue</h1>
        <span className="muted" style={{ fontSize: 13 }}>pre-visit check-in</span>
        <Link href="/clinician" className="chip" style={{ marginLeft: "auto", textDecoration: "none" }}>
          Clinician view →
        </Link>
      </header>

      <div className="chip sim" style={{ display: "inline-block", marginBottom: 14 }}>
        Synthetic patient — not real PHI
      </div>

      {/* ---------- consent gate ---------- */}
      {!consented ? (
        <section className="card">
          <header><h2>Before we start</h2></header>
          <div className="body">
            <p style={{ marginTop: 0, fontSize: 15 }}>{map.consent.text}</p>
            <ul style={{ fontSize: 14, color: "var(--ink-2)", paddingLeft: 20 }}>
              <li>Recorded so it can go in your chart</li>
              <li>Only Dr. Osei&rsquo;s team sees it</li>
              <li>You can skip any question, or stop at any time</li>
            </ul>
            <button className="btn primary big" onClick={grantConsent} style={{ width: "100%", marginTop: 8 }}>
              That&rsquo;s okay — start
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* ---------- conversation ---------- */}
          <section className="card" style={{ marginBottom: 14 }}>
            <header>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--crit)" }} />
              <h2>Recording</h2>
              <span className="chip" style={{ marginLeft: "auto" }}>
                {mode === "browser" ? "microphone" : "scripted"}
              </span>
            </header>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, maxHeight: 320, overflowY: "auto" }}>
              {turns.map((t, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: t.who === "patient" ? "flex-end" : "flex-start", gap: 3 }}>
                  {t.barge && <span className="mono" style={{ fontSize: 10, color: "var(--crit)" }}>— interrupted —</span>}
                  <span className="mono" style={{ fontSize: 9.5, letterSpacing: ".09em", textTransform: "uppercase", color: t.who === "agent" ? "var(--accent)" : "var(--ink-3)" }}>
                    {t.who === "agent" ? "Prologue" : t.who === "patient" ? "You" : "System"}
                  </span>
                  <div
                    style={{
                      padding: "9px 12px",
                      borderRadius: 13,
                      fontSize: 14.5,
                      maxWidth: "88%",
                      background: t.who === "agent" ? "var(--accent-2)" : t.who === "system" ? "transparent" : "var(--surface-2)",
                      border: t.who === "system" ? "1px dashed var(--line)" : "none",
                      color: t.who === "system" ? "var(--ink-3)" : "var(--ink)",
                      fontFamily: t.who === "system" ? "var(--mono)" : "inherit",
                    }}
                  >
                    {t.text}
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
              {mode === "browser" && (
                <button className={`btn ${micLive ? "danger" : "primary"} big`} onClick={toggleMic} disabled={busy} style={{ flex: 1 }}>
                  {micLive ? "◼ Stop" : "🎤 Hold to answer"}
                </button>
              )}
              <button className="btn big" onClick={nextScripted} disabled={busy || scriptIdx >= MARIA_SCRIPT.length} style={{ flex: 1 }}>
                {scriptIdx >= MARIA_SCRIPT.length ? "Script complete" : `Play Maria's next line (${scriptIdx + 1}/${MARIA_SCRIPT.length})`}
              </button>
            </div>
          </section>

          {map.escalation && <div style={{ marginBottom: 14 }}><EscalationCard map={map} audience="patient" /></div>}

          {map.timeline && (
            <section className="card" style={{ marginBottom: 14 }}>
              <header><h2>Why we flagged this</h2></header>
              <Timeline model={map.timeline} audience="patient" />
            </section>
          )}

          {map.reconciliation.length > 0 && (
            <section className="card" style={{ marginBottom: 14 }}>
              <header><h2>Your medication list</h2></header>
              <Reconciliation rows={map.reconciliation} />
            </section>
          )}

          {map.benefits && (
            <section className="card" style={{ marginBottom: 14 }}>
              <header>
                <h2>Your coverage</h2>
                <span className={`chip ${map.benefits.simulated ? "sim" : "live"}`} style={{ marginLeft: "auto" }}>
                  {map.benefits.simulated ? "fixture" : "live 270/271"}
                </span>
              </header>
              <BenefitsCard b={map.benefits} />
            </section>
          )}

          <section className="card" style={{ marginBottom: 14 }}>
            <header><h2>Here&rsquo;s what I heard</h2></header>
            <div>
              {patientItems.length === 0 ? (
                <div className="mono muted" style={{ padding: 20, textAlign: "center" }}>Nothing captured yet</div>
              ) : (
                patientItems.map((i) => <ItemRow key={i.id} item={i} audience="patient" />)
              )}
            </div>
            <div className="disc" style={{ margin: 14 }}>
              Everything here is a <strong>draft</strong>. Nothing goes into your chart until Dr. Osei reviews it.
            </div>
          </section>

          <section className="card">
            <header>
              <h2>What&rsquo;s happening under the hood</h2>
              <span className="chip" style={{ marginLeft: "auto" }}>chart warm {backend?.warmMs ?? "–"} ms · {backend?.chart}</span>
            </header>
            <CallLog calls={map.calls} />
          </section>

          {done && (
            <div style={{ marginTop: 14, textAlign: "center" }}>
              <Link href="/clinician" className="btn primary big" style={{ textDecoration: "none", display: "inline-block" }}>
                Open Dr. Osei&rsquo;s review →
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}
