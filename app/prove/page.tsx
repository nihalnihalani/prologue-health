"use client";

/**
 * "Prove it isn't scripted."
 *
 * Hand this to a judge. Change the drug, the start date, or when the symptom
 * began, and watch the question the agent asks change — or disappear entirely
 * when nothing on the chart warrants it.
 *
 * This runs the SAME engine as the patient check-in. No canned strings.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PrologueSession } from "@/lib/session";
import { DRUG_RISKS } from "@/lib/clinical";
import { chartSlice } from "@/lib/fixtures";
import { Timeline } from "@/components/StoryMap";

const CANDIDATES = [
  ...DRUG_RISKS.map((d) => d.drug),
  "atorvastatin",
  "metformin",
];

export default function ProvePage() {
  const [drug, setDrug] = useState("lamotrigine");
  const [startedDaysAgo, setStarted] = useState(22);
  const [onsetDaysAgo, setOnset] = useState(4);
  const [withValproate, setValproate] = useState(true);
  // The measured duration necessarily differs between the server and client
  // render, so it is only shown after mount. Everything else is deterministic.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const result = useMemo(() => {
    const chart = chartSlice();
    chart.medications = [
      { ...chart.medications[0], id: "mr-test", name: drug, text: drug, startedDaysAgo },
      ...(withValproate
        ? [{ ...chart.medications[1], name: "divalproex sodium", startedDaysAgo: 740 }]
        : []),
    ];

    const s = new PrologueSession("prove");
    s.attachChart(chart, 0, true);
    s.grantConsent();
    const t0 = performance.now();
    const r = s.patientSaid(
      `I've got a rash. It started about ${onsetDaysAgo} days ago.`,
      10
    );
    const elapsed = performance.now() - t0;

    return {
      agentSays: r.agentSays,
      timeline: s.map.timeline,
      inference: s.map.items.find((i) => i.source === "INFERRED"),
      dayOfTherapy: startedDaysAgo - onsetDaysAgo,
      elapsed,
      calls: s.map.calls.filter((c) => c.name === "get_relevant_medications"),
    };
  }, [drug, startedDaysAgo, onsetDaysAgo, withValproate]);

  const fired = Boolean(result.timeline);

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "22px 18px 60px" }}>
      <header style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, letterSpacing: "-.02em" }}>Prove it isn&rsquo;t scripted</h1>
          <p className="muted" style={{ margin: "3px 0 0", fontSize: 13.5 }}>
            Change any fact. The question the agent asks is recomputed from the record every time.
          </p>
        </div>
        <Link href="/patient" className="chip" style={{ marginLeft: "auto", textDecoration: "none" }}>← Check-in</Link>
      </header>

      <section className="card" style={{ marginTop: 18 }}>
        <header><h2>The chart</h2></header>
        <div className="body" style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="mono" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3)" }}>
              Medication on the chart
            </span>
            <select
              id="chart-medication"
              name="chart-medication"
              value={drug}
              onChange={(e) => setDrug(e.target.value)}
              style={{ padding: "9px 10px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontSize: 15 }}
            >
              {CANDIDATES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span className="mono" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3)" }}>
              Started {startedDaysAgo} days ago
            </span>
            <input type="range" min={1} max={120} value={startedDaysAgo} onChange={(e) => setStarted(Number(e.target.value))} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span className="mono" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3)" }}>
              Rash began {onsetDaysAgo} days ago
            </span>
            <input type="range" min={0} max={90} value={onsetDaysAgo} onChange={(e) => setOnset(Number(e.target.value))} />
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input type="checkbox" checked={withValproate} onChange={(e) => setValproate(e.target.checked)} />
            Also on divalproex (a valproate — amplifies lamotrigine rash risk)
          </label>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16, borderColor: fired ? "var(--accent)" : "var(--line)" }}>
        <header>
          <h2>What the agent says next</h2>
          <span className={`chip ${fired ? "live" : ""}`} style={{ marginLeft: "auto" }}>
            {fired ? `fired · day ${result.dayOfTherapy} of therapy` : "no rule matched"}
          </span>
          <span className="chip" suppressHydrationWarning>{mounted ? `${result.elapsed.toFixed(2)} ms` : "— ms"}</span>
        </header>
        <div className="body">
          <p style={{ margin: 0, fontSize: 16.5, lineHeight: 1.5 }}>&ldquo;{result.agentSays}&rdquo;</p>
        </div>
        {result.timeline && <Timeline model={result.timeline} audience="clinician" />}
        {result.inference && (
          <div className="disc" style={{ margin: 14 }}>
            <strong>Inference recorded:</strong> {result.inference.text}
            <br />
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              rule: {result.inference.rule}
              {result.inference.citation?.url && (
                <>
                  {" · "}
                  <a href={result.inference.citation.url} target="_blank" rel="noreferrer">
                    {result.inference.citation.label}
                  </a>
                </>
              )}
            </span>
          </div>
        )}
        {!fired && (
          <div className="disc" style={{ margin: 14 }}>
            Nothing on this chart puts the symptom inside a labeled risk window, so the agent asks a
            general follow-up instead and <strong>records no inference</strong>. It does not
            speculate.
          </div>
        )}
      </section>

      <div className="disc" style={{ marginTop: 16 }}>
        Try: set the drug to <strong>atorvastatin</strong> (no labeled rash window — the question
        disappears). Or keep lamotrigine and drag onset to <strong>60+ days</strong> (outside the
        2–8 week window — nothing fires). Or switch to <strong>allopurinol</strong>, which has a
        different window, and watch the shaded band move.
      </div>
    </main>
  );
}
