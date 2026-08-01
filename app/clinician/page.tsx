"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { User, ClipboardList, ShieldAlert, Check, X, ArrowLeft, Volume2, ShieldCheck, Database, FileText } from "lucide-react";
import type { StoryMap, StoryItem } from "@/lib/types";
import { Timeline, ItemRow, Reconciliation, BenefitsCard, EscalationCard } from "@/components/StoryMap";

const STORE_KEY = "prologue:storymap";

export default function ClinicianPage() {
  const [map, setMap] = useState<StoryMap | null>(null);
  const [queue, setQueue] = useState<any[]>([]);
  const [queueFilter, setQueueFilter] = useState<"review" | "mine" | "completed">("review");
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
  const [receipt, setReceipt] = useState<null | {
    by: string; at: string;
    approvedItemIds: string[]; editedItemIds: string[]; rejectedItemIds: string[];
    writes: { resourceType: string; id?: string; status: string; origin: string; error?: string }[];
    fullyPersisted: boolean; partial: boolean; origin: string;
  }>(null);
  const [replayed, setReplayed] = useState(false);

  const load = useCallback(async () => {
    try {
      const qRes = await fetch("/api/session?queue=1");
      if (qRes.ok) {
        const qj = await qRes.json();
        setQueue(qj.sessions || []);
      }
      
      const fetchUrl = sessionId ? `/api/session?id=${sessionId}` : "/api/session";
      const res = await fetch(fetchUrl);
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
  }, [sessionId]);

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
      setReceipt(j.signature);
      setReplayed(Boolean(j.idempotentReplay));
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
      <motion.main initial={false} animate={{ opacity: 1 }} style={{ maxWidth: 720, margin: "0 auto", padding: 40 }}>
        <h1 style={{ fontSize: 21 }}>Nothing in the queue</h1>
        <p className="muted">Run a patient check-in first, then come back.</p>
        <Link href="/patient" className="btn primary" style={{ textDecoration: "none" }}>Open patient check-in →</Link>
      </motion.main>
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

  const cardVariants: any = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } }
  };

  return (
    <motion.main 
      initial={false} animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
      style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px 40px" }}
    >
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

      <div className="clinician-grid" style={{ gap: 18, marginTop: 16, alignItems: "start" }}>
        {/* --- Column 1: Queue Rail (280px) --- */}
        <motion.div variants={cardVariants} className="card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, background: "var(--surface-sunken)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
            <ClipboardList size={16} className="muted" />
            <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>Clinician Queue</h2>
          </div>
          
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn" style={{ flex: 1, padding: "6px 8px", fontSize: 11, background: queueFilter === "review" ? "var(--accent-2)" : "var(--surface)", borderColor: queueFilter === "review" ? "var(--accent)" : "var(--line)" }} onClick={() => setQueueFilter("review")}>Active</button>
            <button className="btn" style={{ flex: 1, padding: "6px 8px", fontSize: 11, background: queueFilter === "mine" ? "var(--accent-2)" : "var(--surface)", borderColor: queueFilter === "mine" ? "var(--accent)" : "var(--line)" }} onClick={() => setQueueFilter("mine")}>Mine</button>
            <button className="btn" style={{ flex: 1, padding: "6px 8px", fontSize: 11, background: queueFilter === "completed" ? "var(--accent-2)" : "var(--surface)", borderColor: queueFilter === "completed" ? "var(--accent)" : "var(--line)" }} onClick={() => setQueueFilter("completed")}>Done</button>
          </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {queue
              .filter(q => {
                if (queueFilter === "review") return q.state === "ready_for_review" || q.state === "under_review";
                if (queueFilter === "mine") return q.state === "under_review"; // For simplicity
                if (queueFilter === "completed") return q.state === "signed";
                return true;
              })
              .map((q) => (
              <div 
                key={q.id} 
                onClick={() => setSessionId(q.id)}
                style={{ 
                  padding: 10, borderRadius: 6, 
                  border: sessionId === q.id ? "1px solid var(--action)" : "1px solid var(--line)", 
                  background: "var(--surface)", 
                  cursor: "pointer" 
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong style={{ fontSize: 13, color: "var(--ink)" }}>{q.patient}</strong>
                  <span className={`chip ${q.state === 'signed' ? 'live' : 'sim'}`} style={{ fontSize: 9, padding: "2px 6px" }}>{q.state}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-secondary)", marginTop: 4 }}>Items: {q.itemCount}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--ink-muted)", marginTop: 8 }}>
                  <span>{q.locale}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* --- Column 2: Flexible Central Casefile --- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {map.openQuestions.length > 0 && (
            <motion.section variants={cardVariants} className="card">
              <header><ShieldAlert size={18} className="muted" /> <h2>Unresolved</h2></header>
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
            </motion.section>
          )}

          <motion.section variants={cardVariants} className="card">
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
          </motion.section>

          <motion.section variants={cardVariants} className="card">
            <header><ShieldCheck size={18} className="muted" /> <h2>Prologue inferred</h2><span className="chip" style={{ marginLeft: "auto" }}>every item cited</span></header>
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
          </motion.section>

          {record.length > 0 && (
            <motion.section variants={cardVariants} className="card">
              <header><Database size={18} className="muted" /> <h2>From the record</h2></header>
              <div>{record.map((i) => <ItemRow key={i.id} item={i} audience="clinician" />)}</div>
            </motion.section>
          )}
        </div>

        <div className="clinician-right-rail" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {map.timeline && (
            <motion.section variants={cardVariants} className="card">
              <header><FileText size={18} className="muted" /> <h2>Timing</h2></header>
              <Timeline model={map.timeline} audience="clinician" />
            </motion.section>
          )}
          {map.reconciliation.length > 0 && (
            <motion.section variants={cardVariants} className="card">
              <header><ClipboardList size={18} className="muted" /> <h2>Medication reconciliation</h2></header>
              <Reconciliation rows={map.reconciliation} />
            </motion.section>
          )}
          {map.benefits && (
            <motion.section variants={cardVariants} className="card">
              <header>
                <h2>Coverage</h2>
                <span className={`chip ${map.benefits.simulated ? "sim" : "live"}`} style={{ marginLeft: "auto" }}>
                  {map.benefits.simulated ? "fixture" : "live 270/271"}
                </span>
              </header>
              <BenefitsCard b={map.benefits} />
            </motion.section>
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
            ? `signed by ${signed.by}`
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

        {receipt && (
          <div style={{ flexBasis: "100%", marginTop: 8, borderTop: "1px solid var(--line-soft)", paddingTop: 10 }}>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 6 }}>
              Receipt {replayed && "· idempotent replay"}
            </div>
            <div className="mono" style={{ fontSize: 11.5, marginBottom: 8 }}>
              {receipt.approvedItemIds.length} approved · {receipt.editedItemIds.length} edited ·{" "}
              {receipt.rejectedItemIds.length} rejected · signed by {receipt.by}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {receipt.writes.map((w, n) => (
                <div key={`${w.resourceType}-${n}`} className="mono" style={{ fontSize: 11 }}>
                  <span
                    style={{
                      color:
                        w.status === "written" ? "var(--accent)" : w.status === "failed" ? "var(--crit)" : "var(--ink-3)",
                    }}
                  >
                    {w.status === "written" ? "✓" : w.status === "failed" ? "✕" : "—"} {w.resourceType}
                  </span>{" "}
                  <span className="muted overflow-anywhere">
                    {w.id ? `${w.resourceType}/${w.id}` : w.status === "written" ? "(no id returned)" : w.status}
                    {" · "}
                    {w.origin}
                    {w.error && ` · ${w.error}`}
                  </span>
                </div>
              ))}
            </div>
            {receipt.partial && (
              <div className="mono" style={{ fontSize: 11, color: "var(--crit)", marginTop: 6 }}>
                ✕ PARTIAL — some writes landed and others did not. This is recoverable; retry is safe.
              </div>
            )}
            {!receipt.fullyPersisted && !receipt.partial && (
              <div className="mono" style={{ fontSize: 11, color: "var(--warn)", marginTop: 6 }}>
                ⚠ No durable FHIR write was attempted. This signature exists in session state only.
              </div>
            )}
          </div>
        )}
        {mode === "pilot" && !isFinal && (
          <div className="mono" style={{ fontSize: 11, color: "var(--warn)", flexBasis: "100%" }}>
            ⚠ Pilot mode requires server-verified clinician identity. Browser-initiated finalization
            is unavailable until real authentication is configured — roster authorization is demo-only.
          </div>
        )}
        <button
          className="btn primary big"
          style={{ marginLeft: "auto" }}
          onClick={sign}
          disabled={signing || isFinal || undecided > 0 || mode === "pilot"}
          title={
            mode === "pilot"
              ? "Pilot mode requires server-verified identity"
              : undecided > 0
                ? `${undecided} item(s) still need a decision`
                : undefined
          }
        >
          {isFinal ? "Signed ✓" : signing ? "Signing…" : "Approve & sign"}
        </button>
      </div>
    </motion.main>
  );
}
