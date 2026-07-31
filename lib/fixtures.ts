/**
 * Synthetic patient fixtures. NO REAL PHI — ever.
 *
 * These are real FHIR R4 resource shapes so the same code path works against a
 * live Medplum project. Dates are computed relative to now so the demo always
 * reads "22 days ago" regardless of when it runs.
 */

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/**
 * Calendar days between a date-only string and today, in UTC.
 *
 * Previously this rounded elapsed milliseconds against `Date.now()`, which made
 * the answer depend on the time of day: a nominal "22 days ago" became 23 after
 * roughly 18:00 local. Day-of-therapy feeds a clinical window comparison, so a
 * clock-dependent result could flip a determination at the boundary. Comparing
 * UTC calendar days removes the dependency entirely.
 */
export function calendarDaysAgo(dateOnly: string, now: Date = new Date()): number {
  const [y, m, d] = dateOnly.slice(0, 10).split("-").map(Number);
  const then = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - then) / 86_400_000);
}

export const LAMOTRIGINE_STARTED_DAYS_AGO = 22;
export const RASH_STARTED_DAYS_AGO = 4;

export const PATIENT_ID = "maria-delgado-synthetic";

export const patient = {
  resourceType: "Patient",
  id: PATIENT_ID,
  active: true,
  name: [{ use: "official", family: "Delgado", given: ["Maria"] }],
  gender: "female",
  birthDate: "1992-03-14",
  telecom: [{ system: "phone", value: "555-0142", use: "mobile" }],
} as const;

export const appointment = {
  resourceType: "Appointment",
  id: "appt-previsit",
  status: "booked",
  description: "itchy rash on arms and chest",
  start: (() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString();
  })(),
  participant: [
    { actor: { reference: `Patient/${PATIENT_ID}`, display: "Maria Delgado" }, status: "accepted" },
    { actor: { display: "Dr. Amara Osei" }, status: "accepted" },
  ],
} as const;

/** What was PRESCRIBED. Read-only to the agent. */
export const medicationRequests = [
  {
    resourceType: "MedicationRequest",
    id: "mr-lamotrigine",
    status: "active",
    intent: "order",
    medicationCodeableConcept: {
      coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "28439", display: "lamotrigine" }],
      text: "lamotrigine 25 mg oral tablet",
    },
    subject: { reference: `Patient/${PATIENT_ID}` },
    authoredOn: daysAgo(LAMOTRIGINE_STARTED_DAYS_AGO),
    requester: { display: "Dr. Chen, Psychiatry" },
    dosageInstruction: [{ text: "25 mg by mouth once daily" }],
  },
  {
    resourceType: "MedicationRequest",
    id: "mr-divalproex",
    status: "active",
    intent: "order",
    medicationCodeableConcept: {
      coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "38398", display: "divalproex sodium" }],
      text: "divalproex sodium 500 mg delayed-release tablet",
    },
    subject: { reference: `Patient/${PATIENT_ID}` },
    authoredOn: daysAgo(740),
    requester: { display: "Dr. Chen, Psychiatry" },
    dosageInstruction: [{ text: "500 mg by mouth twice daily" }],
  },
  {
    resourceType: "MedicationRequest",
    id: "mr-furosemide",
    status: "active", // ← still active on the chart; the patient stopped it. This is the discrepancy.
    intent: "order",
    medicationCodeableConcept: {
      coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "4603", display: "furosemide" }],
      text: "furosemide 20 mg oral tablet",
    },
    subject: { reference: `Patient/${PATIENT_ID}` },
    authoredOn: daysAgo(300),
    requester: { display: "Dr. Osei, Family Medicine" },
    dosageInstruction: [{ text: "20 mg by mouth once daily" }],
  },
] as const;

export const conditions = [
  {
    resourceType: "Condition",
    id: "cond-bipolar2",
    clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
    verificationStatus: {
      coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "confirmed" }],
    },
    code: {
      coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code: "F31.81", display: "Bipolar II disorder" }],
      text: "Bipolar II disorder",
    },
    subject: { reference: `Patient/${PATIENT_ID}` },
    recordedDate: daysAgo(760),
  },
] as const;

export const allergies = [
  {
    resourceType: "AllergyIntolerance",
    id: "allergy-nkda",
    clinicalStatus: {
      coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active" }],
    },
    code: {
      coding: [{ system: "http://snomed.info/sct", code: "409137002", display: "No known drug allergy" }],
      text: "No known drug allergies",
    },
    patient: { reference: `Patient/${PATIENT_ID}` },
  },
] as const;

export const coverage = {
  resourceType: "Coverage",
  id: "coverage-aetna",
  status: "active",
  subscriberId: "W123456789",
  beneficiary: { reference: `Patient/${PATIENT_ID}` },
  payor: [{ display: "Aetna" }],
  class: [{ type: { coding: [{ code: "plan" }] }, value: "PPO", name: "Aetna PPO" }],
} as const;

/** Benefits shaped exactly like a parsed 271. Used when Stedi credentials are absent. */
export const fixtureBenefits = {
  planName: "Aetna PPO",
  active: true,
  copays: [
    { placeOfService: "Office visit", amount: 40 },
    { placeOfService: "Urgent care", amount: 75 },
    { placeOfService: "Emergency room", amount: 350 },
  ],
  coinsurancePercent: 20,
  deductibleTotal: 2500,
  deductibleRemaining: 1840,
};

export interface ChartMed {
  id: string;
  name: string;
  text: string;
  startedDaysAgo: number;
  dosage: string;
  prescriber: string;
  status: string;
}

export interface ChartSlice {
  patient: typeof patient;
  appointment: typeof appointment;
  medications: ChartMed[];
  conditions: { id: string; text: string }[];
  allergies: { id: string; text: string }[];
  coverage: typeof coverage;
}

/** Everything the agent may read about this patient, pre-warmed at session start. */
export function chartSlice(): ChartSlice {
  return {
    patient,
    appointment,
    medications: medicationRequests.map((m) => ({
      id: m.id,
      name: m.medicationCodeableConcept.coding[0].display,
      text: m.medicationCodeableConcept.text,
      startedDaysAgo: calendarDaysAgo(m.authoredOn),
      dosage: m.dosageInstruction[0].text,
      prescriber: m.requester.display,
      status: m.status,
    })),
    conditions: conditions.map((c) => ({ id: c.id, text: c.code.text })),
    allergies: allergies.map((a) => ({ id: a.id, text: a.code.text })),
    coverage,
  };
}

/** Keyterms fed to Deepgram so drug names transcribe correctly. Closed vocabulary. */
export function keyterms(): string[] {
  return [
    ...medicationRequests.map((m) => m.medicationCodeableConcept.coding[0].display),
    "divalproex sodium",
    "Lamictal",
    "Depakote",
    "rash",
    "mucosal",
    "blistering",
    "Stevens-Johnson",
    "pruritic",
    "Delgado",
  ];
}
