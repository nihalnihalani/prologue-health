"use client";

/**
 * Challenge Prologue — the judge-facing counterfactual.
 *
 * Everything here runs through the PRODUCTION conversation engine
 * (`PrologueSession`), the production clinical functions (`correlate`,
 * `checkRedFlags`), and the production FHIR projection (`projectDrafts`).
 * There is no second rules engine and no hard-coded outcome: change a fact and
 * the result recomputes.
 *
 * "No inference" is a first-class success. A calibrated system that declines is
 * more trustworthy than one that always finds something.
 */

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { PrologueSession } from "@/lib/session";
import { DRUG_RISKS, correlate } from "@/lib/clinical";
import { chartSlice } from "@/lib/fixtures";
import { projectDrafts, type IntakeSession } from "@/lib/intake";
import { Timeline } from "@/components/StoryMap";

type Preset = {
  key: string;
  label: string;
  blurb: string;
  drug: string;
  startedDaysAgo: number;
  onsetDaysAgo: number;
  withValproate: boolean;
  expect: "fires" | "declines";
};

/**
 * Three presets a judge can run without instructions. The third is the one that
 * matters most: a drug with no cited rash window, where the honest answer is to
 * say nothing.
 */
const PRESETS: Preset[] = [
  {
    key: "inside",
    label: "1 · Inside the cited window",
    blurb: "lamotrigine started 22 days ago, rash began 4 days ago",
    drug: "lamotrigine",
    startedDaysAgo: 22,
    onsetDaysAgo: 4,
    withValproate: true,
    expect: "fires",
  },
  {
    key: "outside",
    label: "2 · Same drug, outside the window",
    blurb: "same prescription, but the rash began 4 months in",
    drug: "lamotrigine",
    startedDaysAgo: 130,
    onsetDaysAgo: 4,
    withValproate: true,
    expect: "declines",
  },
  {
    key: "unrelated",
    label: "3 · Unrelated drug — Prologue declines",
    blurb: "atorvastatin has no cited rash window in our table",
    drug: "atorvastatin",
    startedDaysAgo: 22,
    onsetDaysAgo: 4,
    withValproate: false,
    expect: "declines",
  },
];

const CANDIDATES = [...DRUG_RISKS.map((d) => d.drug), "atorvastatin", "metformin"];
const BASELINE = PRESETS[0];

export default function ProvePage() {
  const [drug, setDrug] = useState(BASELINE.drug);
  const [startedDaysAgo, setStarted] = useState(BASELINE.startedDaysAgo);
  const [onsetDaysAgo, setOnset] = useState(BASELINE.onsetDaysAgo);
  const [withValproate, setValproate] = useState(BASELINE.withValproate);
  const [active, setActive] = useState<string | null>(BASELINE.key);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const apply = (p: Preset) => {
    setDrug(p.drug);
    setStarted(p.startedDaysAgo);
    setOnset(p.onsetDaysAgo);
    setValproate(p.withValproate);
    setActive(p.key);
  };
  const reset = () => apply(BASELINE);
  const touch = () => setActive(null);

  const result = useMemo(() => {
    // Same fixture the intake uses, with the judge's facts substituted.
    const chart = chartSlice();
    chart.medications = [
      { ...chart.medications[0], id: "mr-test", name: drug, text: drug, startedDaysAgo },
      ...(withValproate
        ? [{ ...chart.medications[1], name: "divalproex sodium", startedDaysAgo: 740 }]
        : []),
    ];

    // PRODUCTION engine. Not a demo copy.
    const s = new PrologueSession("prove", "en");
    s.attachChart(chart, 0, true);
    s.grantConsent();
    const t0 = performance.now();
    const turn = s.patientSaid(`I've got a rash. It started about ${onsetDaysAgo} days ago.`, 10);
    const elapsed = performance.now() - t0;

    // The raw correlation, so the rule trace can be shown even when it declines.
    const raw = correlate(
      drug,
      startedDaysAgo,
      onsetDaysAgo,
      withValproate ? ["divalproex sodium"] : []
    );

    const inference = s.map.items.find((i) => i.rule?.startsWith("temporal-correlation"));

    // The same projection the approval transaction uses — showing what WOULD be
    // proposed. Items must be approved for inferences to project, so this
    // previews the post-approval state.
    const preview: IntakeSession = {
      id: "prove", patientId: "prove-patient", state: "under_review",
      locale: "en", map: s.map, createdAt: "", updatedAt: new Date().toISOString(),
    };
    for (const i of preview.map.items) i.status = "approved";
    const proposed = projectDrafts(preview);

    return {
      chart,
      statement: `I've got a rash. It started about ${onsetDaysAgo} days ago.`,
      question: turn.agentSays,
      fired: Boolean(s.map.timeline),
      dayOfTherapy: startedDaysAgo - onsetDaysAgo,
      raw,
      inference,
      timeline: s.map.timeline,
      proposed,
      elapsed,
    };
  }, [drug, startedDaysAgo, onsetDaysAgo, withValproate]);

  const Row = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
    <div style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 12, alignItems: "start", padding: "12px 0", borderTop: "1px solid var(--line-soft)" }}>
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", paddingTop: 2 }}>{n}</div>
      <div>
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 4 }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "22px 18px 60px" }}>
      <header style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 25, letterSpacing: "-.02em" }}>Challenge Prologue</h1>
          <p className="muted" style={{ margin: "3px 0 0", fontSize: 14 }}>
            Change any fact. The question, the rule trace, and the proposed FHIR all recompute through
            the production engine.
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span className="chip sim">synthetic chart</span>
          <Link href="/" className="chip" style={{ textDecoration: "none" }}>← Home</Link>
        </div>
      </header>

      {/* ---------- presets ---------- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginTop: 16 }}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => apply(p)}
            className="btn"
            aria-pressed={active === p.key}
            style={{
              textAlign: "left",
              padding: "12px 14px",
              textTransform: "none",
              letterSpacing: 0,
              fontFamily: "var(--sans)",
              fontSize: 14,
              borderColor: active === p.key ? "var(--accent)" : "var(--line)",
              background: active === p.key ? "var(--accent-2)" : "var(--surface)",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 3 }}>{p.label}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{p.blurb}</div>
            <div className="mono" style={{ fontSize: 10, marginTop: 6, color: p.expect === "fires" ? "var(--crit)" : "var(--ink-3)" }}>
              expect: {p.expect === "fires" ? "correlation fires" : "declines to infer"}
            </div>
          </button>
        ))}
      </div>

      {/* ---------- controls ---------- */}
      <section className="card" style={{ marginTop: 14 }}>
        <header>
          <h2>Or change a fact yourself</h2>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={reset}>Reset</button>
        </header>
        <div className="body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,230px),1fr))", gap: 14 }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span className="mono" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)" }}>Medication on the chart</span>
            <select id="drug" name="drug" value={drug}
              onChange={(e) => { setDrug(e.target.value); touch(); }}
              style={{ padding: "8px 10px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontSize: 15 }}>
              {CANDIDATES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span className="mono" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)" }}>Started {startedDaysAgo} days ago</span>
            <input type="range" min={1} max={200} value={startedDaysAgo} onChange={(e) => { setStarted(+e.target.value); touch(); }} />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span className="mono" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)" }}>Rash began {onsetDaysAgo} days ago</span>
            <input type="range" min={0} max={120} value={onsetDaysAgo} onChange={(e) => { setOnset(+e.target.value); touch(); }} />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input type="checkbox" checked={withValproate} onChange={(e) => { setValproate(e.target.checked); touch(); }} />
            also on divalproex (amplifier)
          </label>
        </div>
      </section>

      {/* ---------- the trace ---------- */}
      <section className="card" style={{ marginTop: 16, borderColor: result.fired ? "var(--crit)" : "var(--line)" }}>
        <header>
          <h2>What happened</h2>
          <span className={`chip ${result.fired ? "live" : ""}`} style={{ marginLeft: "auto" }} role="status" aria-live="polite">
            {result.fired ? `correlation fired · day ${result.dayOfTherapy}` : "declined to infer"}
          </span>
          <span className="chip" suppressHydrationWarning>
            {mounted ? `${result.elapsed.toFixed(2)} ms engine` : "— ms"}
          </span>
        </header>

        <div className="body" style={{ paddingTop: 4 }}>
          <Row n={1} title="Chart facts used">
            <div className="mono" style={{ fontSize: 12.5 }}>
              {result.chart.medications.map((m) => (
                <div key={m.name}>{m.name} — started {m.startedDaysAgo} days ago</div>
              ))}
            </div>
          </Row>

          <Row n={2} title="Patient statement">
            <div style={{ fontSize: 15 }}>&ldquo;{result.statement}&rdquo;</div>
          </Row>

          <Row n={3} title="Question generated by the production engine">
            <div style={{ fontSize: 16, lineHeight: 1.45 }}>&ldquo;{result.question}&rdquo;</div>
          </Row>

          <Row n={4} title="Deterministic evaluation">
            {result.raw ? (
              <div className="mono" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                <div>rule: <b>temporal-correlation:{result.raw.drug}</b></div>
                <div>symptom onset = day {result.raw.onsetDayOfTherapy} of therapy</div>
                <div>cited window = days {result.raw.risk.window.fromDay}–{result.raw.risk.window.toDay} ({result.raw.risk.window.label})</div>
                <div>amplifiers present: {result.raw.amplifiers.length ? result.raw.amplifiers.join(", ") : "none"}</div>
                <div style={{ color: result.raw.insideWindow ? "var(--crit)" : "var(--ink-3)" }}>
                  → {result.raw.insideWindow ? "INSIDE the window — fires" : "OUTSIDE the window — declines"}
                </div>
              </div>
            ) : (
              <div className="mono" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                no cited risk window exists for <b>{drug}</b> in the curated table → <b>declines</b>
              </div>
            )}
          </Row>

          <Row n={5} title="Citation">
            {result.raw?.risk.citation ? (
              result.raw.risk.citation.url ? (
                <a href={result.raw.risk.citation.url} target="_blank" rel="noreferrer" style={{ fontSize: 13.5 }}>
                  {result.raw.risk.citation.label}
                </a>
              ) : <span style={{ fontSize: 13.5 }}>{result.raw.risk.citation.label}</span>
            ) : <span className="muted" style={{ fontSize: 13.5 }}>none — nothing is asserted, so nothing needs a source</span>}
          </Row>

          <Row n={6} title="Inference recorded">
            {result.inference ? (
              <div style={{ fontSize: 13.5 }}>{result.inference.text}</div>
            ) : (
              <div style={{ fontSize: 14, color: "var(--accent)" }}>
                <b>None.</b> Prologue declined to infer. This is a calibrated outcome, not a failure —
                the system does not speculate when the chart does not support it.
              </div>
            )}
          </Row>

          <Row n={7} title="Preliminary FHIR that would be proposed">
            <div className="mono" style={{ fontSize: 12 }}>
              {result.proposed.map((r, i) => (
                <div key={i} style={{ color: r.resourceType === "DetectedIssue" ? "var(--infer)" : "var(--ink-2)" }}>
                  {String(r.resourceType)} · status={String(r.status ?? "—")}
                </div>
              ))}
              <div className="muted" style={{ marginTop: 6 }}>
                all preliminary · nothing is written without a clinician signature
              </div>
            </div>
          </Row>
        </div>

        {result.timeline && <Timeline model={result.timeline} audience="clinician" />}
      </section>

      <div className="disc" style={{ marginTop: 16 }}>
        Every value above is computed by the same <code>PrologueSession</code> and clinical functions the
        real intake uses. There is no second rules engine and no lookup table of demo answers — which is
        why preset 3 produces nothing at all.
      </div>
    </main>
  );
}
