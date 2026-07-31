"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { StoryMap, StoryItem } from "@/lib/types";
import { Timeline, ItemRow, Reconciliation, BenefitsCard, EscalationCard } from "@/components/StoryMap";

const STORE_KEY = "prologue:storymap";

export default function ClinicianPage() {
  const [map, setMap] = useState<StoryMap | null>(null);
  // Explicit ruling per promotable item. No default — an unreviewed item blocks
  // signing rather than promoting itself.
  const [ruling, setRuling] = useState<Record<string, "approve" | "reject">>({});
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState<{ at: string; by: string } | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const [source, setSource] = useState<"server" | "local" | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [mode, setMode] = useState<string>("demo");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [signErr, setSignErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Server is authoritative. localStorage is a same-browser fallback only, and
    // is never allowed to declare finality.
    try {
      const res = await fetch("/api/session");
      if (res.ok) {
        const j = (await res.json()) as {
          map: StoryMap | null;
          mode?: string;
          session?: { id: string; state: string };
        };
        if (j.map) {
          setMap(j.map);
          setSessionId(j.session?.id ?? j.map.sessionId);
          setState(j.session?.state ?? null);
          if (j.mode) setMode(j.mode);
          setSource("server");
          return;
        }
      }
    } catch { /* fall through */ }
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const m = JSON.parse(raw) as StoryMap;
        setMap(m);
        setSessionId(m.sessionId);
        setSource("local");
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void load();
    const onStorage = (e: StorageEvent) => { if (e.key === STORE_KEY) void load(); };
    window.addEventListener("storage", onStorage);
    const t = setInterval(() => void load(), 1500);
    return () => { window.removeEventListener("storage", onStorage); clearInterval(t); };
  }, [load]);

  const rule = (id: string, d: "approve" | "reject") =>
    setRuling((r) => ({ ...r, [id]: r[id] === d ? undefined! : d }));

  const play = (item: StoryItem) => {
    setPlaying(item.id);
    if (typeof window !== "undefined" && window.speechSynthesis && item.verbatim) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(item.verbatim);
      u.rate = 1.0;
      u.onend = () => setPlaying(null);
      u.onerror = () => setPlaying(null);
      window.speechSynthesis.speak(u);
    } else {
      setTimeout(() => setPlaying(null), 1200);
    }
  };

  /**
   * Finalization is a server transaction. This function does NOT set a final
   * status — it asks the server, and reloads whatever the server decided. If the
   * server refuses, the UI shows the refusal rather than a success it did not
   * earn.
   */
  const sign = async () => {
    if (!map || !sessionId) return;
    setSigning(true);
    setSignErr(null);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The pilot secret is server-side only. A NEXT_PUBLIC_ variable would
        // have shipped it to every browser, which defeats the gate entirely.
        body: JSON.stringify({
          sessionId,
          clinicianId: "practitioner-osei",
          decisions,
        }),
      });
      const j = await res.json();

      if (!res.ok) {
        setSignErr(j.error ?? `finalization refused (${res.status})`);
        return;
      }

      setWarnings(j.warnings ?? []);
      setSigned({ at: j.signature.at, by: j.signature.by });
      setState(j.state);
      // Reload canonical state rather than constructing a final map locally.
      await load();
    } catch (err) {
      setSignErr((err as Error).message);
    } finally {
      setSigning(false);
    }
  };

  if (!map) {
    return (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: 40 }}>
        <h1 style={{ fontSize: 21 }}>Nothing in the queue</h1>
        <p className="muted">Run a patient check-in first, then come back.</p>
        <Link href="/patient" className="btn primary" style={{ textDecoration: "none" }}>Open patient check-in →</Link>
      </main>
    );
  }

  const said = map.items.filter((i) => i.source === "PATIENT");
  const record = map.items.filter((i) => i.source === "RECORD");
  const inferred = map.items.filter((i) => i.source === "INFERRED");
  const isFinal = map.compositionStatus === "final";
  // Only generated content requires a ruling; a verbatim patient statement is
  // recorded, not asserted by the system.
  const promotable = map.items.filter((i) => i.source === "INFERRED");
  const decisions = promotable
    .filter((i) => ruling[i.id])
    .map((i) => ({ itemId: i.id, decision: ruling[i.id] }));
  const undecided = promotable.length - decisions.length;

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 18px 24px" }}>
      <header style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap", paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, letterSpacing: "-.02em" }}>Pre-visit brief</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13.5 }}>
            {map.patient.name}, {map.patient.age} · {map.patient.appointment.reason} · {map.patient.appointment.when}
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`pill ${isFinal ? "final" : "draft"}`}>{isFinal ? "final" : "preliminary"}</span>
          {source && <span className="chip">{source === "server" ? "server session" : "local only"}</span>}
          {state && <span className="chip">{state.replace(/_/g, " ")}</span>}
          <span className={`chip ${mode === "pilot" ? "live" : "sim"}`}>{mode}</span>
          <Link href="/patient" className="chip" style={{ textDecoration: "none" }}>← Patient view</Link>
        </div>
      </header>

      {map.escalation && <div style={{ margin: "16px 0" }}><EscalationCard map={map} audience="clinician" /></div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,420px)", gap: 18, marginTop: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {map.openQuestions.length > 0 && (
            <section className="card">
              <header><h2>Unresolved</h2></header>
              <div>
                {map.openQuestions.map((q) => (
                  <div key={q.id} style={{ padding: "10px 14px", borderTop: "1px solid var(--line-soft)", display: "flex", gap: 10 }}>
                    <span className="chip" style={{ flex: "none", color: q.kind === "doorknob" ? "var(--warn)" : undefined, borderColor: q.kind === "doorknob" ? "var(--warn)" : undefined }}>{q.kind}</span>
                    <div>
                      <div style={{ fontSize: 13.5 }}>{q.text}</div>
                      {q.detail && <div className="mono muted" style={{ fontSize: 10.5, marginTop: 3 }}>{q.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <header>
              <h2>Patient said</h2>
              <span className="chip" style={{ marginLeft: "auto" }}>verbatim transcript</span>
            </header>
            <div>{said.map((i) => <ItemRow key={i.id} item={i} audience="clinician" onPlay={play} />)}</div>
            {playing && (
              <div className="mono" style={{ padding: "8px 14px", color: "var(--accent)", fontSize: 11 }}>
                🔊 reading the transcript aloud — synthesised speech, not a recording
              </div>
            )}
          </section>

          <section className="card">
            <header><h2>Prologue inferred</h2><span className="chip" style={{ marginLeft: "auto" }}>every item cited</span></header>
            <div>
              {inferred.length === 0
                ? <div className="mono muted" style={{ padding: 20, textAlign: "center" }}>No inferences</div>
                : inferred.map((i) => (
                    <div key={i.id}>
                      <ItemRow
                        item={{ ...i, status: ruling[i.id] === "reject" ? "rejected" : i.status }}
                        audience="clinician"
                      />
                      <div style={{ display: "flex", gap: 8, padding: "0 14px 12px 32px" }}>
                        <button
                          className={`btn ${ruling[i.id] === "approve" ? "primary" : ""}`}
                          onClick={() => rule(i.id, "approve")}
                        >
                          {ruling[i.id] === "approve" ? "✓ approved" : "approve"}
                        </button>
                        <button
                          className={`btn danger ${ruling[i.id] === "reject" ? "danger" : ""}`}
                          onClick={() => rule(i.id, "reject")}
                        >
                          {ruling[i.id] === "reject" ? "✕ rejected" : "reject"}
                        </button>
                        {!ruling[i.id] && (
                          <span className="mono" style={{ fontSize: 10.5, color: "var(--warn)", alignSelf: "center" }}>
                            needs a decision
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
            </div>
          </section>

          {record.length > 0 && (
            <section className="card">
              <header><h2>From the record</h2></header>
              <div>{record.map((i) => <ItemRow key={i.id} item={i} audience="clinician" />)}</div>
            </section>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {map.timeline && (
            <section className="card">
              <header><h2>Timing</h2></header>
              <Timeline model={map.timeline} audience="clinician" />
            </section>
          )}
          {map.reconciliation.length > 0 && (
            <section className="card">
              <header><h2>Medication reconciliation</h2></header>
              <Reconciliation rows={map.reconciliation} />
            </section>
          )}
          {map.benefits && (
            <section className="card">
              <header>
                <h2>Coverage</h2>
                <span className={`chip ${map.benefits.simulated ? "sim" : "live"}`} style={{ marginLeft: "auto" }}>
                  {map.benefits.simulated ? "fixture" : "live 270/271"}
                </span>
              </header>
              <BenefitsCard b={map.benefits} />
            </section>
          )}
        </div>
      </div>

      {/* ---------- the approval gate ---------- */}
      <div style={{ position: "sticky", bottom: 12, marginTop: 24, boxShadow: "0 -6px 24px -10px rgba(0,0,0,.5)", zIndex: 5, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r)", padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div className="mono" style={{ fontSize: 11.5 }}>
          <span className="muted">Composition.status</span>{" "}
          <span className={`pill ${isFinal ? "final" : "draft"}`}>{isFinal ? "final" : "preliminary"}</span>
          {source && <span className="chip">{source === "server" ? "server session" : "local only"}</span>}
          {state && <span className="chip">{state.replace(/_/g, " ")}</span>}
          <span className={`chip ${mode === "pilot" ? "live" : "sim"}`}>{mode}</span>
        </div>
        <div className="mono muted" style={{ fontSize: 11.5 }}>
          {signed
            ? `signed by ${signed.by} · Provenance + AuditEvent written`
            : undecided > 0
              ? `${undecided} item${undecided === 1 ? "" : "s"} still need a decision — nothing has entered the chart`
              : `${decisions.filter((d) => d.decision === "reject").length} rejected · ${decisions.filter((d) => d.decision === "approve").length} approved — not yet signed`}
        </div>
        {signErr && (
          <div className="mono" style={{ fontSize: 11.5, color: "var(--crit)", flexBasis: "100%" }}>
            ✕ {signErr}
          </div>
        )}
        {warnings.map((w) => (
          <div key={w} className="mono" style={{ fontSize: 11, color: "var(--warn)", flexBasis: "100%" }}>
            ⚠ {w}
          </div>
        ))}
        <button
          className="btn primary big"
          style={{ marginLeft: "auto" }}
          onClick={sign}
          disabled={signing || isFinal || undecided > 0}
          title={undecided > 0 ? `${undecided} item(s) still need a decision` : undefined}
        >
          {isFinal ? "Signed ✓" : signing ? "Signing…" : "Approve & sign"}
        </button>
      </div>
    </main>
  );
}
