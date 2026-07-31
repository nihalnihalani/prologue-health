"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { StoryMap, StoryItem } from "@/lib/types";
import { Timeline, ItemRow, Reconciliation, BenefitsCard, EscalationCard } from "@/components/StoryMap";

const STORE_KEY = "prologue:storymap";

export default function ClinicianPage() {
  const [map, setMap] = useState<StoryMap | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState<{ at: string; by: string } | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const load = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setMap(JSON.parse(raw) as StoryMap);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load();
    const onStorage = (e: StorageEvent) => { if (e.key === STORE_KEY) load(); };
    window.addEventListener("storage", onStorage);
    const t = setInterval(load, 1500); // same-tab updates don't fire storage events
    return () => { window.removeEventListener("storage", onStorage); clearInterval(t); };
  }, [load]);

  const toggleReject = (id: string) =>
    setRejected((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));

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

  const sign = async () => {
    if (!map) return;
    setSigning(true);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectedIds: rejected, approvedBy: "Dr. Amara Osei", summary: map.chiefConcern ?? "" }),
      });
      const j = await res.json();
      const next: StoryMap = {
        ...map,
        compositionStatus: "final",
        approvedAt: j.approvedAt,
        approvedBy: j.approvedBy,
        items: map.items.map((i) => ({ ...i, status: rejected.includes(i.id) ? "rejected" : "approved" })),
      };
      setMap(next);
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
      setSigned({ at: j.approvedAt, by: j.approvedBy });
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
            <header><h2>Patient said</h2><span className="chip" style={{ marginLeft: "auto" }}>verbatim · click to hear</span></header>
            <div>{said.map((i) => <ItemRow key={i.id} item={{ ...i, status: rejected.includes(i.id) ? "rejected" : i.status }} audience="clinician" onPlay={play} />)}</div>
            {playing && <div className="mono" style={{ padding: "8px 14px", color: "var(--accent)", fontSize: 11 }}>▶ playing…</div>}
          </section>

          <section className="card">
            <header><h2>Prologue inferred</h2><span className="chip" style={{ marginLeft: "auto" }}>every item cited</span></header>
            <div>
              {inferred.length === 0
                ? <div className="mono muted" style={{ padding: 20, textAlign: "center" }}>No inferences</div>
                : inferred.map((i) => <ItemRow key={i.id} item={{ ...i, status: rejected.includes(i.id) ? "rejected" : i.status }} audience="clinician" onReject={toggleReject} />)}
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
        </div>
        <div className="mono muted" style={{ fontSize: 11.5 }}>
          {signed ? `signed by ${signed.by} · Provenance + AuditEvent written` : `${rejected.length} rejected — nothing has entered the chart`}
        </div>
        <button className="btn primary big" style={{ marginLeft: "auto" }} onClick={sign} disabled={signing || isFinal}>
          {isFinal ? "Signed ✓" : signing ? "Signing…" : "Approve & sign"}
        </button>
      </div>
    </main>
  );
}
