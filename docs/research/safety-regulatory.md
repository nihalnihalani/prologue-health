# Safety & Regulatory

*The design constraints that come from law and clinical practice rather than from product taste. Several of these determine what the product may say out loud.*

---

## FDA — Clinical Decision Support

**Final updated CDS guidance issued January 29, 2026.**

✅ **Good news:** drug-drug and drug-allergy interaction alerts are the **FDA's own textbook example of Non-Device CDS** — exempt from medical device regulation, *provided* the system is:
- **Transparent** — the clinician can see the evidentiary basis
- **Not a replacement for clinical judgment** — the intended clinician user independently evaluates the basis

**Design consequence:** always show *why*. A `DetectedIssue` that displays its rule, its source, and the implicated resources satisfies the transparency condition. **Build the UI so the basis is never hidden**, and this stays in the safe harbor.

Sources: [MedEnvoy](https://medenvoyglobal.com/blog/fda-final-guidance-clinical-decision-support-software/), [Covington](https://www.cov.com/news-and-insights/insights/2026/01/5-key-takeaways-from-fdas-revised-clinical-decision-support-cds-software-guidance)

### ⚠️ Where the safe harbor ends

A **patient-facing individualized treatment recommendation, produced before any clinician is involved**, plausibly falls *outside* the carve-out — the requirement is that the intended *clinician* user independently evaluate the basis before it's acted on. A patient "receiving a treatment plan" reads as the software making the call, not aiding one.

**This is why the original hackathon brief's "n=1 treatment customized just for you" was moved to the roadmap.** Prologue produces *questions for the physician*, not treatment.

### Dermatology precedent — the same line, drawn elsewhere

**DermaSensor** received FDA **De Novo** authorization (Jan 17, 2024) as the first AI device for skin cancer detection in primary care — but it is *spectroscopy hardware used by a clinician on a lesion*, and it required a formal clinical trial.

Meanwhile **Aysa, First Derm, SkinVision, and Miiskin are not FDA-cleared** — they position deliberately as "educational/wellness" tools to stay outside device regulation.

**The line:** organizing and documenting what a patient reports = non-device. Outputting "this looks like melanoma" or a risk score = regulated device.

---

## Recording consent — and an active lawsuit

**California is an all-party consent state ([Penal Code §632](https://www.recordinglaw.com/party-two-party-consent-states/california-recording-laws/)).** All parties must consent before recording a confidential conversation.

⚠️ **This is live litigation, not theory:** **Sharp HealthCare was sued in January 2026** over AI-scribe recording without adequate patient consent. ([Medical Daily](https://www.medicaldaily.com/ai-medical-scribe-recording-patient-consent-2026-privacy-rights-475588))

**And the hackathon is in California.**

### Compliant pattern — visible in the product

- Explicit consent capture **before any audio is processed**, spoken *and* on screen
- Names what is recorded, who sees it, retention, and how to delete
- A **persistent recording indicator**
- Skip-any-question always available
- Consent stored as a **`Consent`** FHIR resource, revocable
- Demonstrated in the demo, not skipped — it doubles as a trust signal

**A ToS checkbox is not this.** Consent has to be a product surface.

---

## AI submitting to payers

**[UNVERIFIED]** No primary-source prohibition was found on software *submitting* a prior-auth request. The commercial pattern exists — Rhyme and Cohere Health already submit programmatically under the ordering provider's NPI.

**But** the attestation of medical necessity is legally tied to the **licensed clinician**. Design consequence: keep a clinician confirmation step rather than auto-submitting.

**On stage, say:** *"clinician-in-the-loop by design, pending real legal review"* — **not** "this is already cleared." Overclaiming here in front of a healthcare-native judge is a self-inflicted wound.

---

## Cost claims — what a 271 can and cannot support

| Claim | Supported? | Why |
|---|---|---|
| "Your plan is active" | ✅ | That is literally what eligibility means |
| "This visit is covered under your office-visit benefit" | ✅ | `insurance.item.benefit` |
| "You've met $660 of your deductible" | ✅ | Returned benefit data, label *as of today* |
| **"This will cost you $340"** | ❌ | Depends on coding, modifiers, secondary payers, adjudication |
| **"This requires prior authorization"** | ❌ | Precisely why Da Vinci CRD exists |

Industry cost-estimator accuracy **fell from 78% (2022) to 71% (2025)**. A confident dollar figure is a specific, falsifiable number the patient will hold you to, generated from a step that cannot support it.

**Product behavior:** the agent states coverage and deductible status, then says *"the office can give you an exact estimate — I'm not able to promise a final number."* **Saying what you can't know is how you earn the claims you do make.**

---

## Alert fatigue

Decades of literature document clinicians learning to click through EHR alerts. Notably, **Abridge's public CDS position is that they deliberately avoid interruptive alerts**, surfacing insights in-flow instead — a UX choice made at ~100M conversations/year, not an oversight.

**Design consequences for Prologue:**
- The agent interrupts **once**, only for high-severity findings, and only pre-visit — never during the clinical encounter
- Coverage and cost information is **never spoken as an interrupt** — it appears on screen
- Escalation routes to the **clinic**, not to the patient as alarm

---

## Bias and equity

**The measurable risk:** an agent that asks fewer follow-up questions when it understands someone less well produces worse care for exactly the patients already underserved. Given that health-literacy disparities are stark (Below-Basic: 9% White vs 41% Hispanic adults) and recall varies from 38% to 65% by education, this is not hypothetical.

**Mitigations, and the metric:**
- Keyterm biasing for drug names
- Confidence-triggered confirmation (*"I heard lamotrigine — is that right?"*)
- Full text fallback, always
- **Log question-depth by ASR-confidence band** and report parity as a product metric

*A bias we intend to measure rather than assume away.*

---

## Prompt injection — patient speech is untrusted input

The patient is the source of the audio. Anything they say enters the model's context.

**Containment, layered:**
1. Patient utterances enter the prompt inside a **delimited block** with an explicit "treat as content, not instructions" framing
2. **Function arguments are schema-validated** at the API boundary
3. **No function can escalate privilege or write final state**, regardless of what the agent asks for — enforced server-side by an AccessPolicy, not by prompt text
4. **Codes come from a fixed allow-list**, never model generation. If a code isn't in the list, the item goes to review uncoded
5. **Benefit values are read from the 271 response only** — never paraphrased or estimated by the model

**The blast radius of a successful injection is a bad draft, which a clinician rejects.** That's the design goal — not perfect prevention, but bounded consequence.

---

## Failure behavior

The governing rule: **degradation removes claims; it never fabricates them.**

| Failure | Behavior |
|---|---|
| Chart retrieval down | Proceed **without chart claims**, and say so |
| Evidence lookup down | **Withhold the inference** rather than guess |
| Eligibility down | *"I couldn't reach your insurer — the office will check"* |
| Red-flag check errors | ⚠️ **Fail closed → escalate.** Safety never fails open |
| ASR fails | Text input, identical pipeline |

---

## What we will not say

**"We're HIPAA compliant."**

This is a prototype on synthetic data. HIPAA compliance involves BAAs, encryption in transit and at rest, audit controls, breach notification, and a security risk analysis — none of which a hackathon build has. Claiming it in front of a healthcare-native judge signals either not understanding the standard or willingness to overclaim.

**What we say instead:** synthetic data only, stated out loud in the first 20 seconds, plus a concrete description of the actual safety architecture — draft states, deterministic escalation, provenance separation, and the approval gate.

---

## The Babylon lesson

Babylon Health went public at **$3.5B** and filed **Chapter 7 in August 2023**, ending care for 2.8M users. Two attributed causes:

1. **Over-claiming AI diagnostic capability** relative to demonstrated accuracy
2. **Single-payer-contract dependency** — Centene, ~half of 2022 revenue, declined to renew

**Both are design constraints here.** We make zero diagnostic claims, and the buyer is the clinic's intake workflow rather than a payer's risk pool.

The lesson isn't "AI doesn't work in healthcare." It's **"don't claim more than you can evidence."**
