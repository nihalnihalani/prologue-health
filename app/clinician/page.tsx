"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { User, ClipboardList, ShieldAlert, Check, X, ArrowLeft, Volume2, ShieldCheck, Database, FileText } from "lucide-react";
import type { StoryMap, StoryItem } from "@/lib/types";
import { Timeline, ItemRow, Reconciliation, BenefitsCard, EscalationCard } from "@/components/StoryMap";

const STORE_KEY = "prologue:storymap";

/**
 * The orchestrating container must never animate its OWN opacity.
 *
 * This element exists only to stagger its children, so its variant was written
 * with just a `transition` and no visual property. framer-motion still wrote
 * `opacity: 0` onto it and then had nothing to animate towards, so the element
 * froze part-way — measured stuck at 0.08 — and took the entire clinician view
 * down with it. The page was fully present in the DOM and simply invisible,
 * which is why it read as a routing or data failure rather than a styling one.
 *
 * Both variants therefore pin the container at opacity 1 and let the children
 * (cardVariants) do the fading. A container cannot hide the page it is only
 * supposed to be sequencing.
 */
const CONTAINER_VARIANTS: Variants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

/**
 * Variants MUST be module-level, not rebuilt inside the component.
 *
 * These cards carry no `initial`/`animate` of their own; they inherit the
 * container's variant label. This object used to be created fresh on every
 * render, and the page re-fetches the session every 1.5s — so each poll handed
 * framer-motion a new variants identity and restarted the enter animation from
 * `hidden`. The cards never finished fading in and sat permanently at opacity 0.
 *
 * A stable reference lets the animation run once and stay finished.
 *
 * Each card also drives its own `initial`/`animate` rather than inheriting the
 * container's label. Relying on propagation left them parked at `hidden`, and
 * app/patient/page.tsx — the view that always rendered correctly — already
 * declares them explicitly. Matching it removes the dependence on a chain that
 * silently costs the clinician the entire brief when it breaks.
 */
const CARD_VARIANTS: Variants = {
  // No opacity here, deliberately.
  //
  // An interrupted transform leaves a card a few pixels off; an interrupted
  // opacity leaves it INVISIBLE. On a screen a clinician uses to review what
  // will enter a patient's chart, "silently blank" is not an acceptable failure
  // mode for a decorative entrance, so movement is animated and visibility is
  // not. The card is readable in every intermediate state.
  hidden: { y: 15 },
  visible: { y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};


/** One row of the clinician work queue, as returned by GET /api/session?queue=1. */
interface QueueRow {
  id: string;
  patientId: string;
  patient: string;
  reason: string | null;
  state: string;
  locale: string;
  updatedAt: string;
  version: number;
  urgency: string | null;
  escalationRule: string | null;
  itemCount: number;
  safetyCovered: boolean | null;
  escalated: boolean;
}

const QUEUE_STATE_LABEL: Record<string, string> = {
  created: "started",
  consented: "consented",
  in_progress: "in progress",
  ready_for_review: "ready",
  under_review: "in review",
  signed: "signed",
  abandoned: "abandoned",
};

/**
 * Which states each tab shows.
 *
 * "Mine" is claimed work (under_review). Identity is not enforced yet, so it
 * cannot honestly mean "assigned to me specifically" — it means claimed by
 * someone. The label stays deliberately modest until real auth lands.
 */
const QUEUE_TABS: Record<"review" | "mine" | "completed", string[]> = {
  review: ["created", "consented", "in_progress", "ready_for_review"],
  mine: ["under_review"],
  completed: ["signed", "abandoned"],
};

/** Human wait time from an ISO/parseable timestamp. */
function waitLabel(updatedAt: string): string {
  const then = new Date(updatedAt).getTime();
  if (!Number.isFinite(then)) return "\u2014";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ${mins % 60}m` : `${Math.floor(h / 24)}d`;
}


export default function ClinicianPage() {
  const [map, setMap] = useState<StoryMap | null>(null);
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
  /** Serialized last-seen map, so polling does not re-render on identical data. */
  const lastMapRef = useRef<string | null>(null);
  /** null until the first queue fetch resolves, so "empty" and "loading" stay distinct. */
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const lastQueueRef = useRef<string | null>(null);
  /**
   * Which session the casefile shows. A ref as well as state because the poll
   * loop is created once and must read the current selection without being
   * torn down and rebuilt on every click.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    // Server is authoritative. localStorage is a same-browser fallback only, and
    // is never allowed to declare finality.
    // The queue is real data now: escalations first, straight from the durable
    // store. It is fetched alongside the casefile so the rail and the open
    // session can never disagree about what exists.
    try {
      const qres = await fetch("/api/session?queue=1");
      if (qres.ok) {
        const qj = (await qres.json()) as { sessions?: QueueRow[] };
        const rows = qj.sessions ?? [];
        const nextQ = JSON.stringify(rows);
        if (nextQ !== lastQueueRef.current) {
          lastQueueRef.current = nextQ;
          setQueue(rows);
        }
      }
    } catch { /* rail degrades to empty; the casefile below still loads */ }

    try {
      const sel = selectedIdRef.current;
      const res = await fetch(sel ? `/api/session?id=${encodeURIComponent(sel)}` : "/api/session");
      if (res.ok) {
        const j = (await res.json()) as {
          map: StoryMap | null;
          mode?: string;
          session?: { id: string; state: string };
        };
        if (j.map) {
          // Only update state when the payload actually CHANGED.
          //
          // This polls every 1.5s. Calling setMap() unconditionally handed React
          // a new object ~40 times a minute, re-rendering the whole brief and
          // restarting every entrance animation before its 0.3s could finish —
          // so cards sat frozen part-way and the review was unreadable.
          // Re-rendering only on real change is both the fix and the honest
          // behaviour: nothing changed, so nothing should move.
          const next = JSON.stringify(j.map);
          if (next !== lastMapRef.current) {
            lastMapRef.current = next;
            setMap(j.map);
          }
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

  /** Open a case from the rail. An explicit click — reads never claim it. */
  const selectSession = useCallback((id: string) => {
    selectedIdRef.current = id;
    setSelectedId(id);
    // Force the next poll's comparison to miss so the casefile swaps immediately.
    lastMapRef.current = null;
    void load();
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

  /*
   * `key` matters here, and so does not fading from zero.
   *
   * This empty state and the populated brief are both <motion.main> in the same
   * tree position, so React reconciles them as ONE element. The stale
   * `opacity: 0` this branch set as its `initial` therefore survived the swap to
   * the real brief, and framer never animated it away — the clinician got a
   * fully rendered, completely invisible page. Distinct keys force a real
   * remount, and starting at opacity 1 means a stuck transition can never hide
   * the review again.
   */
  if (!map) {
    return (
      <motion.main key="empty" initial={{ opacity: 1 }} animate={{ opacity: 1 }} style={{ maxWidth: 720, margin: "0 auto", padding: 40 }}>
        <h1 style={{ fontSize: 21 }}>Nothing in the queue</h1>
        <p className="muted">Run a patient check-in first, then come back.</p>
        <Link href="/patient" className="btn primary" style={{ textDecoration: "none" }}>Open patient check-in →</Link>
      </motion.main>
    );
  }

  const visibleQueue = (queue ?? []).filter((q) => QUEUE_TABS[queueFilter].includes(q.state));

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
    <motion.main
      key="brief"
      initial="hidden" animate="visible"
      variants={CONTAINER_VARIANTS}
      style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px 40px", opacity: 1 }}
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
        <motion.div variants={CARD_VARIANTS} initial="hidden" animate="visible" className="card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, background: "var(--surface-sunken)" }}>
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
            {visibleQueue.length === 0 && (
              <p className="muted" style={{ fontSize: 11.5, margin: "8px 2px" }}>
                {queue === null ? "Loading queue\u2026" : "Nothing in this view."}
              </p>
            )}

            {visibleQueue.map((q) => {
              const isOpen = q.id === sessionId;
              return (
                <button
                  key={q.id}
                  onClick={() => selectSession(q.id)}
                  title={q.escalationRule ? `Escalated: ${q.escalationRule}` : undefined}
                  style={{
                    textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer",
                    padding: 10, borderRadius: 6, background: "var(--surface)",
                    border: `1px solid ${isOpen ? "var(--accent)" : q.escalated ? "var(--warn)" : "var(--line)"}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                    <strong style={{ fontSize: 13, color: "var(--ink)" }}>{q.patient}</strong>
                    <span className={`chip ${q.escalated ? "sim" : "live"}`} style={{ fontSize: 9, padding: "2px 6px", flex: "none" }}>
                      {q.escalated ? (q.urgency ?? "flagged") : QUEUE_STATE_LABEL[q.state] ?? q.state}
                    </span>
                  </div>
                  {q.reason && (
                    <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 4 }}>{q.reason}</div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--ink-3)", marginTop: 8, gap: 6 }}>
                    <span>Wait: {waitLabel(q.updatedAt)}</span>
                    {/*
                      Safety coverage is reported, never inferred. `false` means the
                      deterministic rules could not screen this locale at all, and a
                      clinician must not read that as a clean screen.
                    */}
                    <span style={{ color: q.safetyCovered === false ? "var(--warn)" : undefined }}>
                      {q.safetyCovered === false ? "not screened" : `${q.itemCount} items`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* --- Column 2: Flexible Central Casefile --- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {map.openQuestions.length > 0 && (
            <motion.section variants={CARD_VARIANTS} initial="hidden" animate="visible" className="card">
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

          <motion.section variants={CARD_VARIANTS} initial="hidden" animate="visible" className="card">
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

          <motion.section variants={CARD_VARIANTS} initial="hidden" animate="visible" className="card">
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
            <motion.section variants={CARD_VARIANTS} initial="hidden" animate="visible" className="card">
              <header><Database size={18} className="muted" /> <h2>From the record</h2></header>
              <div>{record.map((i) => <ItemRow key={i.id} item={i} audience="clinician" />)}</div>
            </motion.section>
          )}
        </div>

        <div className="clinician-right-rail" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {map.timeline && (
            <motion.section variants={CARD_VARIANTS} initial="hidden" animate="visible" className="card">
              <header><FileText size={18} className="muted" /> <h2>Timing</h2></header>
              <Timeline model={map.timeline} audience="clinician" />
            </motion.section>
          )}
          {map.reconciliation.length > 0 && (
            <motion.section variants={CARD_VARIANTS} initial="hidden" animate="visible" className="card">
              <header><ClipboardList size={18} className="muted" /> <h2>Medication reconciliation</h2></header>
              <Reconciliation rows={map.reconciliation} />
            </motion.section>
          )}
          {map.benefits && (
            <motion.section variants={CARD_VARIANTS} initial="hidden" animate="visible" className="card">
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
