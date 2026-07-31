"use client";

/**
 * Shared Story Map components.
 *
 * The patient and clinician views render from the SAME StoryMap, so they can
 * never drift apart. Each component takes an `audience` and renders the subset
 * appropriate to it — the patient never sees a condition name, a rule id, or a
 * severity, and never sees a computed price.
 */

import type { StoryMap, StoryItem, TimelineModel, Benefits, ReconRow, ToolCall } from "@/lib/types";
import { t, type Locale } from "@/lib/i18n";

export type Audience = "patient" | "clinician";

/* ------------------------------------------------------------------ */
/* Timeline — the hero visual                                          */
/* ------------------------------------------------------------------ */

export function Timeline({ model, audience }: { model: TimelineModel; audience: Audience }) {
  const pct = (day: number) => Math.max(0, Math.min(100, (day / model.days) * 100));

  return (
    <div style={{ padding: "18px 14px 6px" }}>
      {model.meds.map((m) => {
        const left = pct(Math.max(0, m.startDay));
        const w = m.riskWindow;
        return (
          <div
            key={m.name}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(78px,110px) 1fr",
              gap: 10,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div
              className="mono"
              style={{ fontSize: 11, textAlign: "right", color: m.emphasis ? "var(--ink)" : "var(--ink-3)" }}
            >
              {m.name}
              {m.startDay < 0 && <small style={{ display: "block", fontSize: 9.5, color: "var(--ink-3)" }}>ongoing</small>}
            </div>
            <div style={{ position: "relative", height: 26 }}>
              {w && (
                <div
                  title={w.label}
                  style={{
                    position: "absolute",
                    left: `${pct(w.fromDay)}%`,
                    width: `${pct(w.toDay) - pct(w.fromDay)}%`,
                    top: -6,
                    bottom: -6,
                    background: "var(--warn-bg)",
                    border: "1px dashed var(--warn)",
                    borderRadius: 4,
                  }}
                />
              )}
              <div
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  right: 0,
                  top: 6,
                  height: 14,
                  borderRadius: 3,
                  background: m.emphasis ? "var(--record)" : "var(--ink-3)",
                  opacity: m.emphasis ? 0.85 : 0.45,
                }}
              />
              {m.emphasis &&
                model.events
                  .filter((e) => e.critical)
                  .map((e) => (
                    <div
                      key={e.label}
                      title={`${e.label} — day ${e.day}`}
                      style={{
                        position: "absolute",
                        left: `${pct(e.day)}%`,
                        top: 3,
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "var(--crit)",
                        border: "3px solid var(--surface)",
                        transform: "translateX(-50%)",
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
          gap: 10,
          borderTop: "1px solid var(--line)",
          paddingTop: 6,
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
          gap: 14,
          padding: "10px 2px 4px",
          fontSize: 10.5,
          color: "var(--ink-3)",
          borderTop: "1px solid var(--line-soft)",
          marginTop: 6,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 11, height: 11, borderRadius: 3, background: "var(--warn-bg)", border: "1px dashed var(--warn)" }} />
          {model.meds.find((m) => m.riskWindow)?.riskWindow?.label ?? "risk window"}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--crit)" }} />
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
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "10px 14px",
        borderTop: "1px solid var(--line-soft)",
        opacity: item.status === "rejected" ? 0.4 : 1,
      }}
    >
      <span
        className={`bg-${item.source}`}
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 6, flex: "none" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            textDecoration: item.status === "rejected" ? "line-through" : "none",
          }}
        >
          {text}
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 4 }}>
          <span className={`src-${item.source}`}>
            {audience === "patient" ? t(locale, I18N_SRC[item.source]) : SOURCE_LABEL_CLIN[item.source]}
          </span>
          {audience === "clinician" && item.rule && <> · rule: {item.rule}</>}
          {audience === "clinician" && item.severity && <> · severity: {item.severity}</>}
          {audience === "clinician" && item.fhir && <> · {item.fhir}</>}
          {item.citation && (
            <>
              {" · "}
              {item.citation.url ? (
                <a href={item.citation.url} target="_blank" rel="noreferrer">
                  {item.citation.label}
                </a>
              ) : (
                item.citation.label
              )}
            </>
          )}
        </div>
      </div>

      {audience === "clinician" && item.verbatim && onPlay && (
        <button className="btn" onClick={() => onPlay(item)} title="Hear what the patient said">
          ▶ {item.atSeconds != null ? `${Math.floor(item.atSeconds / 60)}:${String(item.atSeconds % 60).padStart(2, "0")}` : "play"}
        </button>
      )}
      {audience === "clinician" && onReject && item.source === "INFERRED" && (
        <button className="btn danger" onClick={() => onReject(item.id)}>
          {item.status === "rejected" ? "Restore" : "Reject"}
        </button>
      )}
    </div>
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
      {rows.map((r) => (
        <div
          key={r.drug}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: 8,
            fontSize: 13,
            padding: "10px 14px",
            borderBottom: "1px solid var(--line-soft)",
            background: r.state === "match" ? "transparent" : "var(--warn-bg)",
            alignItems: "center",
          }}
        >
          <div>{r.prescribed ?? <span className="muted">not on chart</span>}</div>
          <div style={{ fontWeight: r.state === "match" ? 400 : 600 }}>{r.reported}</div>
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
        </div>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        {b.copays.map((c) => (
          <div key={c.placeOfService} style={{ border: "1px solid var(--line)", borderRadius: "var(--r)", padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.placeOfService}</div>
            <div className="mono" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.02em", margin: "4px 0 2px" }}>
              ${c.amount}
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>copay</div>
          </div>
        ))}
        {b.coinsurancePercent != null && (
          <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r)", padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>After deductible</div>
            <div className="mono" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.02em", margin: "4px 0 2px" }}>
              {b.coinsurancePercent}%
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
              coinsurance · ${b.deductibleRemaining} of ${b.deductibleTotal} left
            </div>
          </div>
        )}
      </div>
      <div className="disc" style={{ marginTop: 11 }}>
        Read directly from the <code>CoverageEligibilityResponse</code> — copay by place of service, coinsurance rate,
        deductible remaining. <strong>No total cost is estimated.</strong> An eligibility response cannot price a service
        that hasn&rsquo;t happened yet.
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
              padding: "7px 14px",
              borderBottom: "1px solid var(--line-soft)",
            }}
          >
            <span style={{ color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <b style={{ color: "var(--ink)" }}>{c.name}</b>
              {c.detail && <span className="muted"> · {c.detail}</span>}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: slow ? "var(--warn)" : "var(--accent)", fontSize: 11.5 }}>
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
    <div
      style={{
        display: "flex",
        gap: 11,
        padding: "13px 14px",
        borderRadius: "var(--r)",
        border: "1px solid var(--crit)",
        background: "var(--crit-bg)",
      }}
    >
      <span className="mono" style={{ fontWeight: 700, color: "var(--crit)", flex: "none" }}>!</span>
      <div>
        <p style={{ margin: 0, fontSize: 14 }}>
          <strong style={{ color: "var(--crit)" }}>
            {audience === "patient" ? "We've asked the office to call you today." : "Escalated to clinic — see today."}
          </strong>{" "}
          {audience === "patient" ? e.patientMessage : e.clinicMessage}
        </p>
        <span className="mono" style={{ display: "block", marginTop: 6, fontSize: 10.5, color: "var(--ink-3)" }}>
          {audience === "clinician" ? `deterministic rule: ${e.ruleId} · severity ${e.severity}` : "A nurse will call you."}
        </span>
      </div>
    </div>
  );
}
