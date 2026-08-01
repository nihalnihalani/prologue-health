/**
 * Prologue — shared domain model.
 *
 * ONE model backs both the patient and clinician views. The patient view renders
 * a plain-language subset; the clinician view renders everything with provenance.
 * They must never diverge, so they read the same StoryMap.
 */

/** Where a fact came from. Rendered distinctly everywhere; never blended. */
export type Source =
  | "PATIENT"    // the patient said it, verbatim, with a transcript offset
  | "RECORD"     // read from the FHIR chart
  | "INFERRED"   // generated — always carries a rule and a citation
  | "INSURANCE"  // returned by the payer (271)
  | "CLINICIAN"; // confirmed by a human reviewer

export type ItemStatus = "draft" | "approved" | "rejected";

/** A single fact on the story map. */
export interface StoryItem {
  id: string;
  source: Source;
  /** Clinician-facing text. */
  text: string;
  /** Plain-language rendering for the patient. Omit to hide from the patient view. */
  patientText?: string;
  /** Seconds into the session, for transcript playback. */
  atSeconds?: number;
  /** Verbatim transcript for PATIENT items — what they actually said. */
  verbatim?: string;
  /** BCP-47 tag of the language the patient actually spoke. Clinician-visible. */
  lang?: string;
  /** For INFERRED items: the deterministic rule that fired. Required. */
  rule?: string;
  /** For INFERRED items: a resolvable source. Required — uncited inference is never promoted. */
  citation?: { label: string; url?: string };
  /** FHIR resources this item implicates. */
  implicates?: string[];
  /** Which FHIR resource this item becomes on approval. */
  fhir?: string;
  status: ItemStatus;
  severity?: "high" | "moderate" | "low";
}

/** Something asked but not answered, or answered inconsistently. */
export interface OpenQuestion {
  id: string;
  text: string;
  kind: "unanswered" | "contradiction" | "doorknob";
  detail?: string;
}

/** Benefits from a 271. Never a price. */
export interface Benefits {
  planName: string;
  active: boolean;
  /** Copay by place of service — this is real 271 data, not an estimate. */
  copays: { placeOfService: string; amount: number }[];
  coinsurancePercent?: number;
  deductibleTotal?: number;
  deductibleRemaining?: number;
  /** True when served from a fixture rather than a live Stedi call. */
  simulated: boolean;
  raw?: unknown;
}

/** A medication reconciliation row: prescribed vs. actually taken. */
export interface ReconRow {
  drug: string;
  /** From MedicationRequest — what was prescribed. */
  prescribed: string | null;
  /** From MedicationStatement — what the patient reports. */
  reported: string | null;
  state: "match" | "discrepancy" | "addition";
  note?: string;
}

/** The timeline visual: a medication with a labeled risk window, and symptom onsets. */
export interface TimelineModel {
  /** Axis length in days. */
  days: number;
  todayDay: number;
  meds: {
    name: string;
    startDay: number;      // may be negative (started before the window)
    ongoing: boolean;
    /** A labeled risk window, in days from this med's start. */
    riskWindow?: { fromDay: number; toDay: number; label: string; citationUrl?: string };
    emphasis?: boolean;
  }[];
  events: { label: string; day: number; critical?: boolean }[];
}

/** Escalation raised by a deterministic rule. Never model-generated. */
export interface Escalation {
  ruleId: string;
  ruleLabel: string;
  severity: "high" | "moderate";
  /** What the clinic is told. */
  clinicMessage: string;
  /** What the patient is told — never names a condition. */
  patientMessage: string;
  /** i18n key so the patient hears this in their own language. */
  patientKey?: "escalateGeneric" | "escalateUrgent";
  citation?: { label: string; url?: string };
}

/** The whole shared model. */
export interface StoryMap {
  sessionId: string;
  /** The patient's language. Clinical text stays English regardless. */
  locale: string;
  patient: {
    id: string;
    name: string;
    age: number;
    appointment: { when: string; reason: string; clinician: string };
  };
  consent: { granted: boolean; at?: string; text: string };
  chiefConcern?: string;
  items: StoryItem[];
  openQuestions: OpenQuestion[];
  reconciliation: ReconRow[];
  timeline?: TimelineModel;
  escalation?: Escalation;
  benefits?: Benefits;
  /** preliminary until a clinician signs; then final. Only the approval handler may set final. */
  compositionStatus: "preliminary" | "final";
  approvedAt?: string;
  approvedBy?: string;
  /** Every measured call, for the latency readout. */
  calls: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  ms: number;
  kind: "read" | "write" | "deterministic" | "payer";
  /** True when served from a fixture rather than a live backend. */
  simulated: boolean;
  at: number;
  detail?: string;
}

export const emptyStoryMap = (
  sessionId: string,
  patient: StoryMap["patient"],
  locale = "en"
): StoryMap => ({
  sessionId,
  locale,
  patient,
  consent: {
    granted: false,
    text:
      "I'll record this so it can go in your chart. Only your care team sees it. " +
      "You can skip any question or stop at any time.",
  },
  items: [],
  openQuestions: [],
  reconciliation: [],
  compositionStatus: "preliminary",
  calls: [],
});
