# FHIR R4 Modeling — Verified

*The Medplum CTO is on the judging panel with 13 years in healthcare data. Getting a resource or code wrong is worse than not attempting it. Everything here is verified against the R4 spec or Medplum docs; unverified items are marked and have a fallback answer.*

---

## `DetectedIssue` — the correct resource for a CDS finding

[hl7.org/fhir/R4/detectedissue.html](https://hl7.org/fhir/R4/detectedissue.html)

`DetectedIssue` is correct for a drug-allergy or drug-interaction finding — **not** `Flag`, `RiskAssessment`, or a persisted `OperationOutcome`.

| Field | Constraint |
|---|---|
| `.status` | Required, bound to ObservationStatus: `registered \| preliminary \| final \| amended +` |
| `.code` | CodeableConcept, preferred binding to `detectedissue-category` |
| `.severity` | Required binding: **exactly `high \| moderate \| low`** |
| `.patient` | Reference(Patient) |
| `.identified[x]` | dateTime \| Period |
| `.author` | Reference(Practitioner \| PractitionerRole \| **Device**) — use `Device` for the agent |
| `.implicated` | Reference(Any) — the problematic activity, i.e. the proposed `MedicationRequest`/`MedicationStatement` |
| `.evidence` | BackboneElement: `.code` + `.detail` Reference(Any) |
| `.detail` | string, human-readable |
| `.mitigation` | BackboneElement: `.action` (required) + `.date` + `.author` |

### ⚠️ Two traps

**1. There is no `ALLERGY` code.** [Verified against the value set](https://www.hl7.org/fhir/R4/valueset-detectedissue-category.html) — the correct code for a drug interaction/allergy alert is **`DRG`** ("Drug Interaction Alert", v3-ActCode). Others: `DACT`, `TPROD`, `NHP`, `NONRX`, `FOOD`. **Do not invent a code.**

**2. `severity` has exactly three values.** Collapse any internal alert tiering onto `high | moderate | low`. Don't add a fourth.

**3. Leave `.mitigation` empty at alert time.** It should only be populated if a real mitigating action (clinician override, order withdrawal) is captured. Writing a fabricated mitigation misrepresents the resource.

### Example

```json
{
  "resourceType": "DetectedIssue",
  "status": "preliminary",
  "code": {
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
      "code": "DRG",
      "display": "Drug Interaction Alert"
    }]
  },
  "severity": "high",
  "patient": { "reference": "Patient/maria" },
  "identifiedDateTime": "2026-08-01T14:32:00Z",
  "author": { "reference": "Device/prologue-agent" },
  "implicated": [
    { "reference": "MedicationStatement/lamotrigine", "display": "Lamotrigine 25mg, started 22 days ago" }
  ],
  "evidence": [{ "detail": [{ "reference": "Observation/rash-onset" }] }],
  "detail": "Rash onset falls within the labeled 2–8 week window for serious rash; concomitant valproate documented."
}
```

**Idiomatic pattern:** a **CDS Hooks card** for the real-time UI nudge, a **`DetectedIssue`** as the persisted record. Both, not either/or — the card can reference the DetectedIssue.

---

## Eligibility — 270/271

[CoverageEligibilityRequest](https://hl7.org/fhir/R4/coverageeligibilityrequest.html) · [Response](https://hl7.org/fhir/R4/coverageeligibilityresponse.html)

`CoverageEligibilityRequest` / `CoverageEligibilityResponse` is the correct mapping. **Medplum's Stedi integration uses exactly this pair.**

`.purpose` accepts exactly four codes:

| Code | Meaning |
|---|---|
| `auth-requirements` | Whether preauthorization is required for the specified services |
| `benefits` | Whether/what benefits exist |
| `discovery` | What coverages the insurer has for the patient |
| `validation` | Whether coverage is valid/in-force |

**Response structure:** `insurance` (0..*) → `.coverage` (required Reference(Coverage)) → `.item` (0..*) → `.item.benefit` (0..*: `.type` required, `.allowed[x]`, `.used[x]`).

- Copay/benefit amounts land in **`insurance.item.benefit`**
- **`insurance.item.preAuthRef`** is a **sibling** of `benefit`, not nested inside it
- Point `insurance.coverage` at the **existing** `Coverage` resource — don't create a new one per check

### ⚠️ Do not build on the 271's auth-required flag

A 271 *can* carry a prior-auth signal (EB segment + free-text MSG), but it is **not reliable per-service, per-payer**. The structural proof: **HL7 built the entire Da Vinci CRD implementation guide precisely because eligibility responses don't answer this dependably.** If the flag worked, CRD wouldn't need to exist.

**And CRD is not buildable here** — it requires the *payer* to run a live CDS-Hooks rules service. Stedi is an X12 clearinghouse.

---

## Prior authorization — Da Vinci PAS *(context only; not buildable in Stedi test mode)*

### The three-stage flow, in order

1. **CRD** (Coverage Requirements Discovery) — **CDS Hooks** at order time (`order-select`/`order-sign`), EHR → payer, returns cards answering *"is prior auth needed, and what does the payer need?"*
2. **DTR** (Documentation Templates and Rules) — executes the payer's documentation rules in the provider's context via SMART app + FHIR Questionnaire/CQL
3. **PAS** (Prior Authorization Support) — submits the assembled Claim + documentation

*Naming these three correctly, in order, is an instant credibility signal with a FHIR-native judge.*

### PAS mechanics

[build.fhir.org/ig/HL7/davinci-pas](https://build.fhir.org/ig/HL7/davinci-pas) · [OperationDefinition](https://build.fhir.org/ig/HL7/davinci-pas/en/OperationDefinition-Claim-submit.html)

- Uses **`Claim` with `use = "preauthorization"`**, answered by `ClaimResponse`. Current published version STU 2.2.1.
- Operation is **`Claim/$submit`**. Input: a Bundle (PAS Request Bundle) containing a PASClaimRequest-profiled `Claim` plus referenced resources. Output: a Bundle containing a PASClaimResponse-profiled `ClaimResponse`, or an `OperationOutcome`.
- **PAS is explicitly a FHIR↔X12-278 bridge**: *"the system converts the Bundle into an ASC X12N 278 and processes it against the target payer system, then converts the resulting 278 response into a response FHIR Bundle containing a ClaimResponse."*
- The authorization number returns as **`ClaimResponse.preAuthRef`**, later carried into the billing claim's `Claim.insurance.preAuthRef`.

### ⚠️ Honesty requirements

- **Do not claim PAS conformance** if hitting a raw 278 REST endpoint. Say plainly that you hand-map X12 into `Claim`/`ClaimResponse`. A CTO judge knows the difference and respects the distinction being drawn.
- **[UNVERIFIED]** The exact field path PAS uses to link the source `ServiceRequest` to the `Claim`. Two fetch attempts on the PAS Claim profile returned metadata only. If pressed: *"it travels in the submission Bundle alongside the Claim, and the Claim's item lines reference the ordered service by code."* **Do not name a specific field.**
- **Do not claim Medplum "ships Da Vinci PAS profiles."** Not confirmed. Claim instead that Medplum ships CDS Hooks plus standard `Claim`/`ClaimResponse`/`CoverageEligibilityRequest` — the resources PAS/CRD are built on.

---

## Prologue's resource map

| Event | Resource | State | Approval needed |
|---|---|---|---|
| Patient identity | `Patient` | final | — |
| Scheduled visit | `Appointment` | booked | — |
| Recording consent | `Consent` | active | — |
| Interview answers | `QuestionnaireResponse` | in-progress → completed | on promotion |
| Confirmed symptom | `Observation` | **preliminary** | ✅ → `final` |
| Suspected condition | `Condition` | — | ✅ **created by clinician only** |
| Patient-reported meds | `MedicationStatement` | draft | ✅ |
| Prescribed meds | `MedicationRequest` | active (read-only to us) | — |
| Allergies | `AllergyIntolerance` | draft if newly proposed | ✅ if new |
| Drug-safety signal | `DetectedIssue` | **preliminary** | ✅ |
| Pre-visit brief | `Composition` | **preliminary** | ✅ → `final` |
| Eligibility ask | `CoverageEligibilityRequest` | active | — |
| Eligibility result | `CoverageEligibilityResponse` | active | — |
| Review work item | `Task` | requested → completed | — |
| Attestation | `Provenance` | immutable | — |
| Every access/change | `AuditEvent` | immutable | — |

### Two rules

**1. The agent never creates a `Condition`.** Asserting a condition is a clinical act. The agent produces `Observation` (what was observed) and `DetectedIssue` (what warrants attention). Only an approving clinician creates `Condition`.

**2. FHIR validity is not clinical correctness.** A schema-valid `Observation` can be completely wrong. Validation buys interoperability, not truth. **The clinician gate is what buys safety** — and that distinction should be stated out loud rather than left for a judge to point out.

---

## `MedicationStatement` vs `MedicationRequest`

A deliberate and load-bearing distinction:

- **`MedicationRequest`** — what was *prescribed*. Already in the chart. Read-only to us.
- **`MedicationStatement`** — what the patient says they're *actually taking*. Created by the agent, draft.

The gap between the two is exactly where **91% of harmful discrepancies (omissions)** live. Modeling them as separate resources rather than mutating one list is what makes reconciliation visible instead of destructive.
