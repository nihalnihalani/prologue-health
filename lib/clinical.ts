/**
 * Deterministic clinical logic.
 *
 * NOTHING IN THIS FILE MAY BE AN LLM CALL.
 *
 * Red-flag detection and drug-timing correlation are safety logic. They must be
 * inspectable, reproducible, and they must FAIL CLOSED — if evaluation throws,
 * we escalate rather than stay silent.
 */

import type { Escalation, TimelineModel } from "./types";

/* ------------------------------------------------------------------ */
/* Drug knowledge — a small, cited, hand-curated table.                */
/* Deliberately NOT model-generated. Every entry carries its source.   */
/* ------------------------------------------------------------------ */

export interface DrugRisk {
  /** Lowercase generic name. */
  drug: string;
  /** Other drugs that amplify the risk. */
  amplifiedBy?: string[];
  window: { fromDay: number; toDay: number; label: string };
  /** What the clinician is told. Never shown to the patient. */
  clinicalNote: string;
  citation: { label: string; url?: string };
}

export const DRUG_RISKS: DrugRisk[] = [
  {
    drug: "lamotrigine",
    amplifiedBy: ["valproate", "valproic acid", "divalproex"],
    window: { fromDay: 14, toDay: 56, label: "2–8 week labeled risk window" },
    clinicalNote:
      "Boxed warning for serious rash including SJS/TEN. Serious rash almost always occurs " +
      "within 2–8 weeks of initiation; risk is increased by concomitant valproate and by " +
      "exceeding the recommended titration schedule.",
    citation: {
      label: "FDA label 022115s031s032 — boxed warning",
      url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/022115s031s032lbl.pdf",
    },
  },
  {
    drug: "allopurinol",
    window: { fromDay: 14, toDay: 84, label: "2–12 week hypersensitivity window" },
    clinicalNote:
      "Severe cutaneous adverse reactions are reported, with onset typically in the first weeks " +
      "to months of therapy.",
    citation: { label: "FDA prescribing information — allopurinol" },
  },
  {
    drug: "trimethoprim-sulfamethoxazole",
    window: { fromDay: 3, toDay: 28, label: "1–4 week reaction window" },
    clinicalNote: "Sulfonamide antibiotics are an established cause of severe cutaneous reactions.",
    citation: { label: "FDA prescribing information — TMP-SMX" },
  },
];

export function findDrugRisk(drugName: string): DrugRisk | undefined {
  const n = drugName.toLowerCase().trim();
  return DRUG_RISKS.find((d) => n.includes(d.drug) || d.drug.includes(n));
}

/* ------------------------------------------------------------------ */
/* Red flags — a rule list, checked every turn.                        */
/* ------------------------------------------------------------------ */

export interface RedFlagRule {
  id: string;
  label: string;
  severity: "high" | "moderate";
  /** Match on the accumulated transcript, lowercased. */
  patterns: RegExp[];
  clinicMessage: string;
  patientMessage: string;
}

export const RED_FLAG_RULES: RedFlagRule[] = [
  {
    id: "mucosal-involvement",
    label: "Mucosal involvement with rash",
    severity: "high",
    patterns: [
      /\b(mouth|lip|lips|oral|tongue|throat|gum|gums)\b[^.?!]{0,40}\b(sore|hurt|ulcer|blister|raw|pain)/,
      /\b(sore|painful|blistered|ulcerated)\b[^.?!]{0,30}\b(mouth|lips|throat|tongue)\b/,
      /\beyes?\b[^.?!]{0,30}\b(burning|gritty|red|sore)\b/,
    ],
    clinicMessage:
      "Mucosal involvement reported alongside a new rash. Severe cutaneous adverse reaction " +
      "cannot be excluded on history alone — recommend same-day assessment.",
    patientMessage:
      "I'd like someone from the office to call you today rather than waiting for your appointment.",
  },
  {
    id: "blistering-peeling",
    label: "Blistering or skin peeling",
    severity: "high",
    patterns: [/\b(blister|blisters|blistering|peeling|sloughing|skin.{0,10}coming off)\b/],
    clinicMessage: "Blistering or desquamation reported. Recommend same-day assessment.",
    patientMessage: "I want a nurse to call you today about this.",
  },
  {
    id: "systemic-symptoms",
    label: "Fever or systemic symptoms with rash",
    severity: "moderate",
    patterns: [/\b(fever|feverish|chills|temperature)\b/, /\bswollen\b[^.?!]{0,20}\b(face|lymph|glands)\b/],
    clinicMessage: "Systemic symptoms reported with rash. Consider expedited review.",
    patientMessage: "I'll let the office know so they can decide whether to see you sooner.",
  },
  {
    id: "airway-breathing",
    label: "Breathing difficulty or throat tightness",
    severity: "high",
    patterns: [
      /\b(trouble|hard|difficult|difficulty)\b[^.?!]{0,20}\bbreath/,
      /\b(short of breath|throat.{0,15}(closing|tight)|can'?t breathe|wheez)/,
    ],
    clinicMessage: "Possible airway involvement reported. Urgent — do not route to routine intake.",
    patientMessage:
      "That's something that needs attention right now. Please call 911 or go to an emergency room.",
  },
];

/**
 * Evaluate red-flag rules against the transcript so far.
 *
 * FAILS CLOSED: any exception produces an escalation rather than silence.
 */
export function checkRedFlags(transcript: string): Escalation | null {
  try {
    const t = transcript.toLowerCase();
    // Highest severity wins; within severity, first rule wins.
    const ordered = [...RED_FLAG_RULES].sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1
    );
    for (const rule of ordered) {
      if (rule.patterns.some((p) => p.test(t))) {
        return {
          ruleId: rule.id,
          ruleLabel: rule.label,
          severity: rule.severity,
          clinicMessage: rule.clinicMessage,
          patientMessage: rule.patientMessage,
        };
      }
    }
    return null;
  } catch {
    // Safety logic must never fail open.
    return {
      ruleId: "evaluation-error",
      ruleLabel: "Safety check could not complete",
      severity: "moderate",
      clinicMessage:
        "The automated safety check failed to evaluate. Escalating by default — please review manually.",
      patientMessage: "I want someone from the office to review this with you today.",
    };
  }
}

/* ------------------------------------------------------------------ */
/* Temporal correlation — symptom onset vs. medication start.          */
/* ------------------------------------------------------------------ */

export interface Correlation {
  drug: string;
  risk: DrugRisk;
  /** Day of therapy on which the symptom began. */
  onsetDayOfTherapy: number;
  insideWindow: boolean;
  /** Amplifying co-prescriptions actually present on the chart. */
  amplifiers: string[];
}

export function correlate(
  drugName: string,
  drugStartedDaysAgo: number,
  symptomStartedDaysAgo: number,
  otherActiveDrugs: string[]
): Correlation | null {
  const risk = findDrugRisk(drugName);
  if (!risk) return null;

  const onsetDayOfTherapy = drugStartedDaysAgo - symptomStartedDaysAgo;
  if (onsetDayOfTherapy < 0) return null; // symptom predates the drug

  const amplifiers = (risk.amplifiedBy ?? []).filter((a) =>
    otherActiveDrugs.some((d) => d.toLowerCase().includes(a.toLowerCase()))
  );

  return {
    drug: drugName,
    risk,
    onsetDayOfTherapy,
    insideWindow:
      onsetDayOfTherapy >= risk.window.fromDay && onsetDayOfTherapy <= risk.window.toDay,
    amplifiers,
  };
}

/** Build the hero visual from a correlation. */
export function buildTimeline(
  c: Correlation,
  drugStartedDaysAgo: number,
  symptomStartedDaysAgo: number,
  backgroundDrugs: string[]
): TimelineModel {
  const days = Math.max(60, c.risk.window.toDay + 6, drugStartedDaysAgo + 6);
  return {
    days,
    todayDay: drugStartedDaysAgo,
    meds: [
      // Only drugs that actually amplify the risk earn a track. Everything else
      // is noise on the one visual that has to make the argument by itself.
      ...backgroundDrugs
        .filter((n) => c.amplifiers.some((a) => n.toLowerCase().includes(a.toLowerCase())))
        .map((name) => ({
        name,
        startDay: -8, // runs off the left edge: started long before this window
        ongoing: true,
      })),
      {
        name: c.drug,
        startDay: 0,
        ongoing: true,
        emphasis: true,
        riskWindow: {
          fromDay: c.risk.window.fromDay,
          toDay: c.risk.window.toDay,
          label: c.risk.window.label,
          citationUrl: c.risk.citation.url,
        },
      },
    ],
    events: [
      { label: "rash began", day: c.onsetDayOfTherapy, critical: true },
      { label: "today", day: drugStartedDaysAgo },
    ],
  };
}
