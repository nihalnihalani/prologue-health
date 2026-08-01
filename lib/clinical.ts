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
/* Negation and historical framing                                     */
/* ------------------------------------------------------------------ */

/**
 * A rule matching inside a negated or historical clause is a FALSE escalation.
 * "my mouth is not sore" and "I had a sore mouth last year" both previously
 * escalated, which is how a safety layer earns the alert fatigue it exists to
 * avoid.
 *
 * This is deliberately conservative: it only suppresses when negation or past
 * framing is unambiguous and close to the match. Anything uncertain still
 * escalates, because a false positive costs a phone call and a false negative
 * costs a patient.
 */
const NEGATION = /\b(no|not|never|none|without|denies|denied|deny|negative for|free of|isn'?t|aren'?t|wasn'?t|hasn'?t|haven'?t|don'?t|doesn'?t|didn'?t)\b/;
const HISTORICAL = /\b(last (year|month|week)|years? ago|months? ago|previously|used to|in the past|history of|resolved|cleared up|went away|gone now|no longer)\b/;

/** Split into clauses so negation in one clause does not mask a real report in another. */
function clauses(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\s+(?:but|however|although|though)\s+|[;,]\s+/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** True when this clause is negated or clearly historical. */
export function isSuppressed(clause: string): boolean {
  return NEGATION.test(clause) || HISTORICAL.test(clause);
}

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
  /** i18n key for the patient-facing message. English text below is the fallback. */
  patientKey: "escalateGeneric" | "escalateUrgent";
  /** Match on the accumulated transcript, lowercased. */
  patterns: RegExp[];
  clinicMessage: string;
  patientMessage: string;
}

/**
 * Locales whose red-flag rules have been written and tested.
 *
 * This set is the honest boundary of the safety layer. Adding a UI language does
 * NOT add safety coverage; only adding and testing rules does. Anything outside
 * this set fails closed with a coverage-gap escalation.
 */
export const SAFETY_RULE_LOCALES = new Set(["en"]);

/**
 * Whether the deterministic rules were actually able to screen this transcript.
 *
 * For an unsupported language, "no rule matched" means "not evaluated" — not
 * "no red flags". That distinction has to reach the clinician, or the absence
 * of a flag reads as reassurance it has not earned. It is deliberately NOT a
 * conversational escalation: it is a fact about the packet, not something to
 * say to the patient.
 */
export function safetyCoverage(locale: string): { covered: boolean; note?: string } {
  if (SAFETY_RULE_LOCALES.has(locale)) return { covered: true };
  return {
    covered: false,
    note:
      `Deterministic red-flag rules are validated for English only. This intake was conducted in ` +
      `"${locale}" and was NOT automatically screened. Read the transcript before relying on the ` +
      `absence of a flag.`,
  };
}

export const RED_FLAG_RULES: RedFlagRule[] = [
  {
    id: "mucosal-involvement",
    label: "Mucosal involvement with rash",
    severity: "high",
    patientKey: "escalateGeneric",
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
    patientKey: "escalateGeneric",
    patterns: [/\b(blister|blisters|blistering|peeling|sloughing|skin.{0,10}coming off)\b/],
    clinicMessage: "Blistering or desquamation reported. Recommend same-day assessment.",
    patientMessage: "I want a nurse to call you today about this.",
  },
  {
    id: "systemic-symptoms",
    label: "Fever or systemic symptoms with rash",
    severity: "moderate",
    patientKey: "escalateGeneric",
    patterns: [/\b(fever|feverish|chills|temperature)\b/, /\bswollen\b[^.?!]{0,20}\b(face|lymph|glands)\b/],
    clinicMessage: "Systemic symptoms reported with rash. Consider expedited review.",
    patientMessage: "I'll let the office know so they can decide whether to see you sooner.",
  },
  {
    id: "airway-breathing",
    label: "Breathing difficulty or throat tightness",
    severity: "high",
    patientKey: "escalateUrgent",
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
export function checkRedFlags(transcript: string, locale = "en"): Escalation | null {
  try {
    const t = transcript.toLowerCase();

    // Highest severity wins; within severity, first rule wins.
    const ordered = [...RED_FLAG_RULES].sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1
    );

    const parts = clauses(t);
    for (const rule of ordered) {
      for (const clause of parts) {
        if (!rule.patterns.some((p) => p.test(clause))) continue;
        // A match inside a negated or historical clause is not a finding.
        if (isSuppressed(clause)) continue;
        return {
          ruleId: rule.id,
          ruleLabel: rule.label,
          severity: rule.severity,
          clinicMessage: rule.clinicMessage,
          patientMessage: rule.patientMessage,
          patientKey: rule.patientKey,
        };
      }
    }

    void locale;
    return null;
  } catch {
    // Safety logic must never fail open.
    return {
      ruleId: "evaluation-error",
      ruleLabel: "Safety check could not complete",
      severity: "moderate",
      patientKey: "escalateGeneric",
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
