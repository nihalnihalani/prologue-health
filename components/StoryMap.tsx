"use client";

/**
 * Shared Story Map components.
 *
 * The patient and clinician views render from the SAME StoryMap, so they can
 * never drift apart. Each component takes an `audience` and renders the subset
 * appropriate to it — the patient never sees a condition name, a rule id, or a
 * severity, and never sees a computed price.
 */

import { motion } from "framer-motion";
import { 
  Volume2, Play, Check, X, AlertTriangle, HeartPulse, Activity, 
  FileText, Database, TrendingUp, Info, ShieldCheck, HelpCircle
} from "lucide-react";
import type { StoryMap, StoryItem, TimelineModel, Benefits, ReconRow, ToolCall } from "@/lib/types";
import { t, type Locale } from "@/lib/i18n";

export type Audience = "patient" | "clinician";

/* ------------------------------------------------------------------ */
/* Timeline — the hero visual                                          */
/* ------------------------------------------------------------------ */

export function Timeline({ model, audience }: { model: TimelineModel; audience: Audience }) {
  const pct = (day: number) => Math.max(0, Math.min(100, (day / model.days) * 100));

  const srTextSummary = model.meds.map((m) => {
    const risk = m.riskWindow ? `, risk window for ${m.riskWindow.label} starting from day ${m.riskWindow.fromDay} to day ${m.riskWindow.toDay}` : "";
    return `${m.name} started on day ${m.startDay}${risk}.`;
  }).join(" ");

  return (
    <div style={{ padding: "18px 14px 6px" }}>
      {/* Screen-reader-only accessible text alternative */}
      <div style={{ position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", border: 0 }}>
        Timeline summary: {srTextSummary}
      </div>
      {model.meds.map((m) => {
        const left = pct(Math.max(0, m.startDay));
        const w = m.riskWindow;
        return (
          <div
            key={m.name}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(78px,110px) 1fr",
              gap: 12,
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div
              className="mono"
              style={{ fontSize: 11, textAlign: "right", color: m.emphasis ? "var(--ink)" : "var(--ink-3)", fontWeight: m.emphasis ? 600 : 400 }}
            >
              {m.name}
              {m.startDay < 0 && <small style={{ display: "block", fontSize: 9.5, color: "var(--ink-3)" }}>ongoing</small>}
            </div>
            <div style={{ position: "relative", height: 26, display: "flex", alignItems: "center" }}>
              {w && (
                <motion.div
                  initial={{ opacity: 0, scaleX: 0 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
                  style={{
                    position: "absolute",
                    left: `${pct(w.fromDay)}%`,
                    width: `${pct(w.toDay) - pct(w.fromDay)}%`,
                    top: -4,
                    bottom: -4,
                    background: "var(--warn-bg)",
                    border: "1px dashed var(--warn)",
                    borderRadius: 6,
                    transformOrigin: "left",
                  }}
                  title={w.label}
                />
              )}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${100 - left}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  top: "50%",
                  y: "-50%",
                  height: 10,
                  borderRadius: 5,
                  background: m.emphasis ? "var(--record)" : "var(--ink-3)",
                  opacity: m.emphasis ? 0.85 : 0.3,
                }}
              />
              {m.emphasis &&
                model.events
                  .filter((e) => e.critical)
                  .map((e) => (
                    <motion.div
                      key={e.label}
                      title={`${e.label} — day ${e.day}`}
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.2, 1] }}
                      transition={{ delay: 0.4, duration: 0.4 }}
                      style={{
                        position: "absolute",
                        left: `${pct(e.day)}%`,
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "var(--crit)",
                        border: "3px solid var(--surface)",
                        transform: "translateX(-50%)",
                        boxShadow: "0 0 0 4px var(--crit-bg)",
                        cursor: "pointer",
                      }}
                    />
                  ))}
            </div>
          </div>
        );
      })}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(78px,110px) 1fr",
          gap: 12,
          borderTop: "1px solid var(--line)",
          paddingTop: 8,
          marginTop: 12,
        }}
      >
        <div />
        <div className="mono" style={{ position: "relative", height: 18, fontSize: 10, color: "var(--ink-3)" }}>
          <span style={{ position: "absolute", left: 0 }}>day 0</span>
          {model.meds.find((m) => m.riskWindow) && (
            <>
              <span style={{ position: "absolute", left: `${pct(model.meds.find((m) => m.riskWindow)!.riskWindow!.fromDay)}%`, transform: "translateX(-50%)" }}>
                {model.meds.find((m) => m.riskWindow)!.riskWindow!.fromDay}
              </span>
              <span style={{ position: "absolute", left: `${pct(model.meds.find((m) => m.riskWindow)!.riskWindow!.toDay)}%`, transform: "translateX(-50%)" }}>
                {model.meds.find((m) => m.riskWindow)!.riskWindow!.toDay}
              </span>
            </>
          )}
        </div>
      </div>

      <div
        className="mono"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          padding: "12px 2px 4px",
          fontSize: 10.5,
          color: "var(--ink-3)",
          borderTop: "1px solid var(--line-soft)",
          marginTop: 8,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 12, height: 12, borderRadius: 3, background: "var(--warn-bg)", border: "1px dashed var(--warn)" }} />
          {model.meds.find((m) => m.riskWindow)?.riskWindow?.label ?? "risk window"}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--crit)" }} />
          {audience === "patient" ? "when your rash started" : `symptom onset — day ${model.events.find((e) => e.critical)?.day}`}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Story items with provenance                                         */
/* ------------------------------------------------------------------ */

const SOURCE_LABEL: Record<StoryItem["source"], string> = {
  PATIENT: "You told us",
  RECORD: "From your record",
  INFERRED: "Prologue noticed",
  INSURANCE: "From your insurer",
  CLINICIAN: "Confirmed by your clinician",
};

const SOURCE_LABEL_CLIN: Record<StoryItem["source"], string> = {
  PATIENT: "PATIENT SAID",
  RECORD: "FROM RECORD",
  INFERRED: "INFERRED",
  INSURANCE: "INSURANCE",
  CLINICIAN: "CLINICIAN",
};

const I18N_SRC: Record<StoryItem["source"], string> = {
  PATIENT: "srcPatient",
  RECORD: "srcRecord",
  INFERRED: "srcInferred",
  INSURANCE: "srcInsurance",
  CLINICIAN: "srcPatient",
};

export function ItemRow({
  item,
  audience,
  locale = "en",
  onReject,
  onPlay,
}: {
  item: StoryItem;
  audience: Audience;
  locale?: Locale;
  onReject?: (id: string) => void;
  onPlay?: (item: StoryItem) => void;
}) {
  const text = audience === "patient" ? item.patientText : item.text;
  if (!text) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: item.status === "rejected" ? 0.4 : 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 100, damping: 15 }}
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        padding: "12px 16px",
        borderTop: "1px solid var(--line-soft)",
        background: item.source === "INFERRED" && item.status !== "rejected" ? "rgba(124, 58, 237, 0.02)" : "transparent",
      }}
    >
      <span
        className={`bg-${item.source}`}
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 7, flex: "none" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            textDecoration: item.status === "rejected" ? "line-through" : "none",
            color: "var(--ink)",
          }}
        >
          {text}
        </div>
        <div className="mono" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", fontSize: 10.5, color: "var(--ink-3)", marginTop: 4 }}>
          <span className={`src-${item.source}`} style={{ fontWeight: 600 }}>
            {audience === "patient" ? t(locale, I18N_SRC[item.source]) : SOURCE_LABEL_CLIN[item.source]}
          </span>
          {audience === "clinician" && item.lang && !item.lang.startsWith("en") && (
            <span
              className="src-PATIENT"
              title="Spoken in this language. This is the original, not a translation."
              style={{ display: "flex", alignItems: "center", gap: 3 }}
            >
              • original · {item.lang}
            </span>
          )}
          {audience === "clinician" && item.rule && <span>• rule: {item.rule}</span>}
          {audience === "clinician" && item.severity && (
            <span style={{ color: item.severity === "high" ? "var(--crit)" : "var(--warn)" }}>
              • severity: {item.severity}
            </span>
          )}
          {audience === "clinician" && item.fhir && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              • <Database size={10} /> {item.fhir}
            </span>
          )}
          {item.citation && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              •{" "}
              {item.citation.url ? (
                <a href={item.citation.url} target="_blank" rel="noreferrer">
                  {item.citation.label}
                </a>
              ) : (
                item.citation.label
              )}
            </span>
          )}
        </div>
      </div>

      {audience === "clinician" && item.verbatim && onPlay && (
        <button
          className="btn"
          style={{ padding: "6px 10px", fontSize: 11 }}
          onClick={() => onPlay(item)}
          title="Read the transcript aloud (synthesised — no audio is recorded)"
        >
          <Volume2 size={12} />
        </button>
      )}
      {audience === "clinician" && onReject && item.source === "INFERRED" && (
        <button className="btn danger" style={{ padding: "6px 10px", fontSize: 11 }} onClick={() => onReject(item.id)}>
          {item.status === "rejected" ? "Restore" : "Reject"}
        </button>
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Reconciliation ledger                                               */
/* ------------------------------------------------------------------ */

export function Reconciliation({ rows }: { rows: ReconRow[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <div
        className="mono"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto",
          fontSize: 10,
          letterSpacing: ".09em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          padding: "9px 14px 7px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div>Chart says</div>
        <div>Patient says</div>
        <div />
      </div>
      {rows.map((r, i) => (
        <motion.div
          key={r.drug}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: 8,
            fontSize: 13,
            padding: "12px 14px",
            borderBottom: "1px solid var(--line-soft)",
            background: r.state === "match" ? "transparent" : "var(--warn-bg)",
            alignItems: "center",
          }}
        >
          <div style={{ color: "var(--ink)" }}>{r.prescribed ?? <span className="muted">not on chart</span>}</div>
          <div style={{ fontWeight: r.state === "match" ? 400 : 600, color: "var(--ink)" }}>{r.reported}</div>
          <div
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              padding: "2px 7px",
              borderRadius: 4,
              border: "1px solid",
              borderColor: r.state === "match" ? "var(--line)" : "var(--warn)",
              color: r.state === "match" ? "var(--ink-3)" : "var(--warn)",
              whiteSpace: "nowrap",
            }}
          >
            {r.state}
          </div>
        </motion.div>
      ))}
      <div className="disc" style={{ margin: 14 }}>
        The chart holds a <code>MedicationRequest</code> — what was <em>prescribed</em>. The patient&rsquo;s answer becomes
        a <code>MedicationStatement</code> — what is <em>actually taken</em>. FHIR keeps them separate, and the gap
        between them is where most harmful medication discrepancies live.{" "}
        <strong>Flagged for the clinician. The agent does not change the list.</strong>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Benefits — never a price                                            */
/* ------------------------------------------------------------------ */

export function BenefitsCard({ b }: { b: Benefits }) {
  return (
    <div className="body">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        {b.copays.map((c, i) => (
          <motion.div 
            key={c.placeOfService} 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1, duration: 0.3 }}
            style={{ border: "1px solid var(--line)", borderRadius: "var(--r)", padding: 14, background: "var(--surface)" }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{c.placeOfService}</div>
            <div className="mono" style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-.03em", margin: "6px 0 2px", color: "var(--ink)" }}>
              ${c.amount}
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", fontWeight: 500 }}>copay</div>
          </motion.div>
        ))}
        {b.coinsurancePercent != null && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: b.copays.length * 0.1, duration: 0.3 }}
            style={{ border: "1px solid var(--line)", borderRadius: "var(--r)", padding: 14, background: "var(--surface)" }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>After deductible</div>
            <div className="mono" style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-.03em", margin: "6px 0 2px", color: "var(--ink)" }}>
              {b.coinsurancePercent}%
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", fontWeight: 500 }}>
              coinsurance · ${b.deductibleRemaining} of ${b.deductibleTotal} left
            </div>
          </motion.div>
        )}
      </div>
      <div className="disc" style={{ marginTop: 12 }}>
        {b.simulated ? (
          <span><strong>Simulated benefit data</strong> (mock response). In a live production deployment, this data is read directly in real-time from a <code>CoverageEligibilityResponse</code> transaction. <strong>No total cost is estimated.</strong></span>
        ) : (
          <span>Read directly from the <code>CoverageEligibilityResponse</code> — copay by place of service, coinsurance rate, deductible remaining. <strong>No total cost is estimated.</strong> An eligibility response cannot price a service that hasn&rsquo;t happened yet.</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Function call log with measured latency                             */
/* ------------------------------------------------------------------ */

export function CallLog({ calls }: { calls: ToolCall[] }) {
  if (!calls.length) return <div style={{ padding: 20, textAlign: "center" }} className="mono muted">No calls yet</div>;
  return (
    <div className="mono" style={{ fontSize: 12 }}>
      {calls.slice(-9).map((c) => {
        const slow = c.ms > 200;
        return (
          <div
            key={c.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 10,
              alignItems: "center",
              padding: "8px 14px",
              borderBottom: "1px solid var(--line-soft)",
            }}
          >
            <span style={{ color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <b style={{ color: "var(--ink)" }}>{c.name}</b>
              {c.detail && <span className="muted"> · {c.detail}</span>}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: slow ? "var(--warn)" : "var(--accent)", fontSize: 11.5, fontWeight: 600 }}>
              {c.ms < 1 ? `${c.ms.toFixed(1)}` : Math.round(c.ms)} ms
            </span>
            <span
              className="chip"
              style={{
                fontSize: 9.5,
                padding: "2px 6px",
                color: c.kind === "deterministic" ? "var(--record)" : undefined,
                borderColor: c.kind === "deterministic" ? "var(--record)" : undefined,
              }}
            >
              {c.kind}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Escalation                                                          */
/* ------------------------------------------------------------------ */

export function EscalationCard({ map, audience }: { map: StoryMap; audience: Audience }) {
  const e = map.escalation;
  if (!e) return null;
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      style={{
        display: "flex",
        gap: 14,
        padding: "16px",
        borderRadius: "var(--r)",
        border: "1px solid var(--crit)",
        background: "var(--crit-bg)",
        boxShadow: "0 10px 15px -3px rgba(220, 38, 38, 0.1), 0 4px 6px -4px rgba(220, 38, 38, 0.1)",
      }}
    >
      <motion.div
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--crit)" }}
      >
        <AlertTriangle size={24} />
      </motion.div>
      <div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          <strong style={{ color: "var(--crit)" }}>
            {audience === "patient" ? "We've asked the office to call you today." : "Escalated to clinic — see today."}
          </strong>{" "}
          {audience === "patient" ? e.patientMessage : e.clinicMessage}
        </p>
        <span className="mono" style={{ display: "block", marginTop: 6, fontSize: 11, color: "var(--ink-3)", fontWeight: 500 }}>
          {audience === "clinician" ? `deterministic rule: ${e.ruleId} · severity ${e.severity}` : "A nurse will call you."}
        </span>
      </div>
    </motion.div>
  );
}
