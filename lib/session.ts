/**
 * The conversation engine.
 *
 * This is the brain, and it is shared by BOTH paths:
 *   - live voice (Deepgram drives patientSaid() from real ASR)
 *   - deterministic fallback (a script drives patientSaid() with canned words)
 *
 * In fallback mode the patient's WORDS are scripted. Everything downstream —
 * the chart read, the temporal correlation, the red-flag evaluation, the
 * question the agent asks next — is computed live from the record. That matters:
 * the chart-conditioned question is the product, and it is never a canned string.
 */

import {
  emptyStoryMap,
  type StoryMap,
  type StoryItem,
  type ToolCall,
  type ReconRow,
} from "./types";
import { checkRedFlags, correlate, buildTimeline } from "./clinical";
import type { ChartSlice } from "./fixtures";

let seq = 0;
const uid = (p: string) => `${p}-${++seq}`;

export interface TurnResult {
  /** What the agent says next. Computed, not looked up. */
  agentSays: string;
  /** Tool calls made during this turn, with measured latency. */
  calls: ToolCall[];
  /** True when this turn triggered an escalation. */
  escalated: boolean;
}

export class PrologueSession {
  map: StoryMap;
  private chart: ChartSlice | null = null;
  private transcript = "";
  private asked = new Set<string>();

  constructor(sessionId: string) {
    this.map = emptyStoryMap(sessionId, {
      id: "maria-delgado-synthetic",
      name: "Maria Delgado",
      age: 34,
      appointment: { when: "Thursday", reason: "itchy rash on arms and chest", clinician: "Dr. Amara Osei" },
    });
  }

  private record(c: Omit<ToolCall, "id" | "at">) {
    const call: ToolCall = { ...c, id: uid("call"), at: Date.now() };
    this.map.calls.push(call);
    return call;
  }

  /** Warm the chart. Called once at session start so mid-turn reads are local. */
  attachChart(chart: ChartSlice, ms: number, simulated: boolean) {
    this.chart = chart;
    this.record({ name: "warm_chart", ms, kind: "read", simulated, detail: `${chart.medications.length} medications` });
    this.map.patient.name = [chart.patient.name[0].given[0], chart.patient.name[0].family].join(" ");
  }

  grantConsent() {
    this.map.consent = { ...this.map.consent, granted: true, at: new Date().toISOString() };
    this.record({ name: "save_consent", ms: 0.4, kind: "write", simulated: true, detail: "Consent" });
  }

  private addItem(item: Omit<StoryItem, "id" | "status"> & { status?: StoryItem["status"] }) {
    const full: StoryItem = { id: uid("item"), status: item.status ?? "draft", ...item };
    this.map.items.push(full);
    return full;
  }

  /**
   * Process one patient utterance.
   *
   * Order matters: safety first (deterministic, every turn), then extraction,
   * then the chart-conditioned follow-up.
   */
  patientSaid(text: string, atSeconds: number): TurnResult {
    const callsBefore = this.map.calls.length;
    this.transcript += " " + text;

    this.addItem({
      source: "PATIENT",
      text,
      patientText: text,
      verbatim: text,
      atSeconds,
      fhir: "Observation (preliminary)",
    });

    /* ---- 1. Safety, every turn, deterministic ---- */
    const t0 = performance.now();
    const flag = checkRedFlags(this.transcript);
    this.record({
      name: "check_red_flags",
      ms: Math.round((performance.now() - t0) * 100) / 100,
      kind: "deterministic",
      simulated: false,
      detail: flag ? flag.ruleId : "no rule matched",
    });

    if (flag && !this.map.escalation) {
      this.map.escalation = flag;
      this.addItem({
        source: "INFERRED",
        text: flag.clinicMessage,
        rule: flag.ruleId,
        severity: flag.severity,
        citation: { label: `Deterministic rule: ${flag.ruleLabel}` },
        fhir: "DetectedIssue (preliminary)",
      });
      return {
        agentSays: flag.patientMessage,
        calls: this.map.calls.slice(callsBefore),
        escalated: true,
      };
    }

    /* ---- 2. Extract structure ---- */
    const onsetDays = extractOnsetDays(text);
    if (onsetDays !== null && !this.map.chiefConcern) {
      this.map.chiefConcern = text.trim();
    }

    /* ---- 3. Chart-conditioned follow-up — THE product ---- */
    const followUp = this.chartConditionedQuestion(onsetDays);
    if (followUp) return { agentSays: followUp, calls: this.map.calls.slice(callsBefore), escalated: false };

    return {
      agentSays: this.nextGenericQuestion(),
      calls: this.map.calls.slice(callsBefore),
      escalated: false,
    };
  }

  /**
   * Look at what the patient just said, look at the chart, and see whether any
   * medication's labeled risk window contains the reported symptom onset.
   *
   * If it does, the agent asks about that drug — a question that does not exist
   * without the record.
   */
  private chartConditionedQuestion(onsetDays: number | null): string | null {
    if (!this.chart || onsetDays === null || this.asked.has("drug-timing")) return null;

    const t0 = performance.now();
    const others = this.chart.medications.map((m) => m.name);

    let hit: ReturnType<typeof correlate> = null;
    let hitMed: (typeof this.chart.medications)[number] | null = null;
    for (const med of this.chart.medications) {
      const c = correlate(med.name, med.startedDaysAgo, onsetDays, others.filter((n) => n !== med.name));
      if (c?.insideWindow) {
        hit = c;
        hitMed = med;
        break;
      }
    }

    this.record({
      name: "get_relevant_medications",
      ms: Math.round((performance.now() - t0) * 100) / 100,
      kind: "read",
      simulated: false,
      detail: hit ? `${hit.drug}: day ${hit.onsetDayOfTherapy} of therapy` : "no timing match",
    });

    if (!hit || !hitMed) return null;

    this.asked.add("drug-timing");

    this.map.timeline = buildTimeline(
      hit,
      hitMed.startedDaysAgo,
      onsetDays,
      this.chart.medications.filter((m) => m.name !== hit!.drug).map((m) => m.name)
    );

    this.addItem({
      source: "RECORD",
      text: `${hitMed.name} ${hitMed.dosage} — started ${hitMed.startedDaysAgo} days ago (${hitMed.prescriber})`,
      patientText: `You started ${hitMed.name} about ${Math.round(hitMed.startedDaysAgo / 7)} weeks ago.`,
      implicates: [`MedicationRequest/${hitMed.id}`],
    });

    const amp = hit.amplifiers.length
      ? ` Concomitant ${hit.amplifiers[0]} documented, which increases the risk.`
      : "";

    this.addItem({
      source: "INFERRED",
      text:
        `Symptom onset falls on day ${hit.onsetDayOfTherapy} of ${hit.drug} therapy — inside the ` +
        `${hit.risk.window.label}.${amp} ${hit.risk.clinicalNote}`,
      rule: `temporal-correlation:${hit.drug}`,
      severity: "high",
      citation: hit.risk.citation,
      implicates: [`MedicationRequest/${hitMed.id}`],
      fhir: "DetectedIssue (preliminary)",
    });

    return (
      `That helps. One thing I want to check — and it may be nothing. Your record shows you ` +
      `started ${hitMed.name} about ${Math.round(hitMed.startedDaysAgo / 7)} weeks ago. Is that right?`
    );
  }

  private nextGenericQuestion(): string {
    const order = [
      ["distribution", "Where exactly is it — and has it spread since it started?"],
      ["quality", "Is it itchy, painful, or neither?"],
      ["assoc", "Have you noticed anything else at all — even something that seems unrelated?"],
    ] as const;
    for (const [k, q] of order) {
      if (!this.asked.has(k)) {
        this.asked.add(k);
        return q;
      }
    }
    return "Thanks — that's helpful.";
  }

  /** Confirm the drug the agent asked about. Records the patient's confirmation. */
  confirmMedication(text: string, atSeconds: number) {
    this.addItem({
      source: "PATIENT",
      text,
      patientText: text,
      verbatim: text,
      atSeconds,
    });
  }

  /**
   * Medication reconciliation: what was prescribed vs. what is actually taken.
   * `stopped` are drugs the patient reports having discontinued.
   */
  reconcile(taking: string[], stopped: string[], added: string[] = []) {
    if (!this.chart) return;
    const t0 = performance.now();
    const rows: ReconRow[] = [];

    for (const med of this.chart.medications) {
      const isStopped = stopped.some((s) => med.name.toLowerCase().includes(s.toLowerCase()));
      const isTaking = taking.some((s) => med.name.toLowerCase().includes(s.toLowerCase()));
      rows.push({
        drug: med.name,
        prescribed: `${med.name} — ${med.dosage}`,
        reported: isStopped ? "stopped taking it" : isTaking ? "taking it" : "not mentioned",
        state: isStopped ? "discrepancy" : "match",
        note: isStopped ? "Chart lists this as active; patient reports discontinuation" : undefined,
      });
    }
    for (const a of added) {
      rows.push({ drug: a, prescribed: null, reported: a, state: "addition", note: "Not on the chart" });
    }

    this.map.reconciliation = rows;
    this.record({
      name: "save_confirmed_patient_statement",
      ms: Math.round((performance.now() - t0) * 100) / 100,
      kind: "write",
      simulated: true,
      detail: `${rows.filter((r) => r.state !== "match").length} discrepancies`,
    });

    for (const r of rows.filter((x) => x.state !== "match")) {
      // A reconciliation finding is a comparison, not something the patient
      // said verbatim — so it is not filed under PATIENT.
      this.addItem({
        source: "RECORD",
        text: `${r.drug} — chart lists ${r.prescribed ?? "nothing"}; patient reports "${r.reported}"`,
        patientText: `Your list shows ${r.drug}, and you told me you ${r.reported}.`,
        rule: "medication-reconciliation",
        fhir: "MedicationStatement (draft) vs MedicationRequest (active)",
      });
      this.map.openQuestions.push({
        id: uid("q"),
        kind: "contradiction",
        text: `Reconcile ${r.drug} — chart active, patient reports otherwise`,
        detail: r.note,
      });
    }
  }

  addDoorknob(text: string, atSeconds: number) {
    this.addItem({ source: "PATIENT", text, patientText: text, verbatim: text, atSeconds });
    this.map.openQuestions.unshift({
      id: uid("q"),
      kind: "doorknob",
      text,
      detail: "Raised at the end of the call, unprompted, and not explored.",
    });
  }

  attachBenefits(b: NonNullable<StoryMap["benefits"]>, ms: number) {
    this.map.benefits = b;
    this.record({
      name: "run_eligibility_check",
      ms,
      kind: "payer",
      simulated: b.simulated,
      detail: b.simulated ? "fixture (no Stedi key)" : "live 270/271",
    });
    this.addItem({
      source: "INSURANCE",
      text:
        `${b.planName}: coverage active. ` +
        b.copays.map((c) => `${c.placeOfService} copay $${c.amount}`).join("; ") +
        (b.coinsurancePercent ? `; ${b.coinsurancePercent}% coinsurance` : "") +
        (b.deductibleRemaining ? `; $${b.deductibleRemaining} deductible remaining` : ""),
      patientText:
        `Your ${b.planName} is active. You've got about $${b.deductibleRemaining} left on your deductible. ` +
        `The office can give you an exact estimate — I can't promise a final number.`,
      fhir: "CoverageEligibilityResponse",
    });
  }

  /** Only this may move the Composition to final. */
  approve(rejectedIds: string[], by: string) {
    for (const item of this.map.items) {
      item.status = rejectedIds.includes(item.id) ? "rejected" : "approved";
    }
    this.map.compositionStatus = "final";
    this.map.approvedAt = new Date().toISOString();
    this.map.approvedBy = by;
    this.record({ name: "sign_composition", ms: 0.3, kind: "write", simulated: true, detail: "preliminary → final" });
  }
}

/** Pull a day count out of natural speech: "maybe four days", "a week", "since Tuesday". */
export function extractOnsetDays(text: string): number | null {
  const t = text.toLowerCase();
  const words: Record<string, number> = {
    a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, couple: 2, few: 3,
  };
  const m = t.match(
    /(\d+|a|one|two|three|four|five|six|seven|eight|nine|ten|couple|few)\s*(?:of\s+)?(day|week|month)/
  );
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : words[m[1]] ?? 1;
  const mult = m[2] === "week" ? 7 : m[2] === "month" ? 30 : 1;
  return n * mult;
}
