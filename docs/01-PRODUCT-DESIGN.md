# PROLOGUE — Final Hackathon Design

**"The visit starts before the visit."**
YC × Medplum Agentic Healthcare Hackathon · Aug 1, 2026

---

# A. FINDINGS FROM THE SPONSOR DOCUMENTATION

*Read before designing. Three findings changed the architecture; one killed a plan I had been carrying.*

## A1. Medplum ships a Stedi integration — dated **July 27, 2026**, four days before the event

[medplum.com/docs/integration/stedi](https://www.medplum.com/docs/integration/stedi)

| X12 | FHIR mapping | Notes |
|---|---|---|
| **270/271** eligibility | `CoverageEligibilityRequest` → `CoverageEligibilityResponse` | Real-time |
| **837P** professional claims | `Claim` via **`$stedi-submit-claim`** operation | Stedi correlation ID written back to the Claim |
| **277CA** acknowledgments, **835** ERA | `DocumentReference` (stored verbatim) | — |

**Consequence:** we do not hand-roll an X12↔FHIR mapping. We use Medplum's documented path, which means our FHIR is correct *by construction* rather than by our own interpretation.

## A2. ⚠️ Stedi test mode does **NOT** support 278 prior authorization

[stedi.com/docs/healthcare/test-mode](https://www.stedi.com/docs/healthcare/test-mode)

| Supported in test mode | **Not supported** |
|---|---|
| 270/271 real-time eligibility | **278 prior authorization** |
| 837 claims (`usageIndicator: "T"`) | **276/277 claim status** |
| 835 ERA, 277CA | 275 attachments, enrollment, insurance discovery, COB |

**This kills a plan I had been carrying.** Earlier in this project I concluded "don't trust the 271's auth flag — go straight to a 278 inquiry." **That is impossible in test mode.** Any hackathon demo claiming a live prior-auth transaction is either not using test mode or not telling the truth.

It also *resolves* the question in our favor: eligibility is the only real transaction available, which is exactly the one that can be presented honestly (§ coverage design). We were heading there anyway; now it's forced, and that's fine.

**Other test-mode facts that shape the build:**
- Mock payers are **Aetna, Cigna, UnitedHealthcare, CMS** only. **"Custom mock data or payer selection" is not supported** — so the synthetic patient must be built around a predefined mock request, not the reverse.
- Selecting payer **"Stedi Agent"** returns a deliberate **AAA error 73 (Invalid/Missing Subscriber/Insured Name)**. This is a gift: a documented, reproducible failure we can use to demo graceful degradation.
- Test transactions are **free**.
- The 271 returns **copays, deductibles, other patient payment responsibilities, and active coverage**.

## A3. Deepgram Voice Agent — the exact Settings surface

[configure-voice-agent](https://developers.deepgram.com/docs/configure-voice-agent) · [function-calling](https://developers.deepgram.com/docs/voice-agents-function-calling)

Verified field paths we will actually use:

```
audio.input.encoding            "linear16" (default), audio.input.sample_rate 16000
agent.listen.provider.type      "deepgram"
agent.listen.provider.model     nova-3 family (v1) | flux-general-en (v2)
agent.listen.provider.version   "v1" | "v2"
agent.listen.provider.keyterms  ← keyterm prompting is a FIRST-CLASS field
agent.listen.provider.eot_threshold  ← end-of-turn tuning
agent.think.provider.type       "anthropic" | "open_ai" | "google" | "groq" | "aws_bedrock"
agent.think.provider.model
agent.think.provider.reasoning_mode  "low" | "medium" | "high"
agent.think.prompt              max 25,000 chars
agent.think.functions           ← array of callable functions
agent.speak.provider.model      "aura-2-thalia-en" (v1) | "flux-alexis-en" (v2)
agent.greeting
agent.context.messages
flags.history
```

Function calling supports **client-side** (our app executes; good for UI actions and client-auth APIs) and **server-side** (Deepgram calls our endpoint; good for secure lookups). Message types are `FunctionCallRequest` / `FunctionCallResponse`.

**Model choice, decided:** `nova-3` + `keyterms`, not Flux. Flux is tuned for turn-taking latency, but our demo lives or dies on correctly transcribing **"lamotrigine"** and **"divalproex."** Drug-name accuracy beats a few tens of milliseconds of turn latency. `eot_threshold` is our lever for turn-taking feel instead.

**Function execution split, decided:** **client-side** for the reads that steer the conversation (lowest latency, no extra hop), **server-side** for the eligibility write. Reasoning in §J.

## A4. Medplum's own AI doc prescribes our safety model

[medplum.com/docs/ai](https://www.medplum.com/docs/ai) — Medplum advocates the **"can suggest, but not act"** pattern: *"an AI may draft a note or recommend an order, while a human remains responsible"* — enforced with **AuditEvent logging** for every AI action and **role-based permissions** so AI agents are governed by *"the same policy framework as a human user."*

Also documented: a **`$ai` operation** and **Medplum MCP**.

**Consequence:** our review gate is not a clever idea we invented — it is the platform's documented architecture. We build to it and say so.

---

# B. OPPORTUNITY ANALYSIS

## Patient side

**Hard to remember or communicate:** medication names, doses, and *start dates*; what was stopped and why; the sequence of symptoms; what a previous specialist said. Up to **67% of patients have at least one error in their medication history, and 91% of discrepancies are omissions** — and those omissions trace to *how the history was taken*, not to downstream logic ([PMC2518028](https://pmc.ncbi.nlm.nih.gov/articles/PMC2518028/)).

**Why forms fail:** a form is a fixed graph. It cannot ask question *n+1* based on answer *n*, cannot notice a contradiction, and cannot connect an answer to the chart. It's also a literacy tax — only **12% of US adults have proficient health literacy** ([NAAL](https://nces.ed.gov/naal/health_results.asp)).

**Pre-visit anxiety:** "is this serious?", "will I be able to explain it?", "what will this cost?" — and the patient gets **18 seconds** before the first interruption; only **23%** finish their opening statement ([Beckman & Frankel](https://pmc.ncbi.nlm.nih.gov/articles/PMC1783704/)). The real concern often surfaces at the doorknob, or never.

**Unanswered insurance questions:** is my coverage even active? Have I met my deductible? Will this visit apply to it?

**Where speaking beats typing:** narrative sequence, uncertainty ("it's kind of like…"), anything requiring a follow-up, and every accessibility case — arthritis, low vision, limited English, age.

## Clinician side

**Missing at the door:** what actually changed since last visit; what the patient is *really* worried about; what they've actually been taking; the timeline.

**Present but hard to retrieve:** the med start date buried three screens deep that would explain the whole presentation.

**Wasted clinical time:** re-asking what the chart already knows. Physicians spend **~2 hours on EHR/desk work per 1 hour of face time** ([Sinsky, *Annals*](https://www.acpjournals.org/doi/10.7326/M16-0961)), inside a **~18 minute** average visit.

**What structured pre-visit info changes:** the visit starts at minute three instead of minute zero — and occasionally, it starts *before* the appointment, because someone noticed something that shouldn't wait.

## What this stack does that a chatbot cannot

| Capability | Why a plain chatbot can't |
|---|---|
| Ask a question determined by the patient's **actual chart** | Requires a real longitudinal FHIR store with query-time retrieval |
| **Barge-in and natural turn-taking** with medical vocabulary | Requires streaming STT with keyterm biasing + endpointing control |
| Run a **real X12 270/271** mid-conversation | Requires a clearinghouse; no LLM can fabricate a payer response |
| Produce output a clinician can **approve into a chart** | Requires FHIR resources with draft/final states, Provenance, AuditEvent |

Every one of those is visible on stage. That's the point.

---

# C. SEVEN CONCEPTS

### 1. PROLOGUE — Chart-aware adaptive pre-visit interview
**Pitch:** A voice intake that has already read your chart, so it asks the question no form could.
**User:** Any patient with an appointment and prior records.
**Problem:** Intake collects what it knows to ask; it never catches what the patient didn't know to mention.
**Why voice:** The connection only exists because the patient volunteered timing in free speech.
**Magical moment:** Books for "a rash." Agent knows lamotrigine started 22 days ago with divalproex alongside, recognizes the boxed-warning window, and escalates.
**Medplum:** Source of truth — history retrieval, `QuestionnaireResponse`, `Observation`, `Condition`, `DetectedIssue`, `Composition`, `Task`, `Provenance`, `AuditEvent`.
**Deepgram:** Voice Agent with `agent.think.functions`, keyterm-biased drug names, barge-in, spoken confirm-back.
**Stedi:** 270/271 via Medplum's integration, triggered *by the escalation* — "seen today, no billing surprise."
**Safety:** Never names a condition to the patient. Escalation routes to the clinic. Nothing final without sign-off.
**Build:** The whole loop.
**Company:** The pre-visit window is owned by form vendors with no clinical reasoning layer.
**Could lose because:** most moving parts of the seven.

### 2. RECONCILE — Voice medication reconciliation
**Pitch:** A three-minute call that makes the med list true.
**User:** Polypharmacy, pre-op, post-discharge.
**Why voice:** Patients describe pills by color and shape, and mention stopping things only in passing.
**Magical moment:** "Your chart lists five. You've described four, added two, and stopped one. Let's walk the differences."
**Medplum:** `MedicationStatement` (patient-reported) reconciled against `MedicationRequest` (prescribed).
**Deepgram:** Keyterm prompting is load-bearing — *metoprolol* vs *metolazone*.
**Stedi:** Weak fit; bolted on.
**Safety:** Proposes; never edits. Never says stop taking anything.
**Could lose because:** the output is a diff table. Correct, unforgettable to a pharmacist, forgettable to a judge.

### 3. SIGHTLINE — Voice-guided dermatology intake
**Pitch:** Coaches the patient to photograph the rash properly while taking the derm history by voice.
**Why voice:** Hands are busy holding the camera.
**Magical moment:** "Move a little closer — and put a coin beside it for scale."
**Medplum:** `Media`/`DocumentReference` + structured `Observation`.
**Stedi:** Weak fit.
**Safety:** **Explicitly does not classify the lesion** — the line between documentation aid and regulated device. Aysa, First Derm, SkinVision and Miiskin all sit deliberately on the "educational" side of it.
**Could lose because:** "so it's a camera app," plus venue lighting.

### 4. TRACEBACK — Medication side-effect investigation
**Pitch:** Asks whether the new symptom is actually the old prescription.
**Magical moment:** "Your cough started within a month of beginning lisinopril — that's documented. Worth asking your doctor."
**Medplum:** `MedicationStatement` dates vs `Observation` onset → `DetectedIssue`.
**Safety:** Frames as a *question*. Never advises stopping.
**Could lose because:** it's a feature of #1, not a product.

### 5. HANDOFF — Specialist referral preparation
**Pitch:** Makes sure you arrive at the specialist with the workup already done.
**Problem:** Referrals get burned re-collecting history and discovering the labs weren't ordered.
**Medplum:** `ServiceRequest` + `Task` + a referral `Composition`.
**Stedi:** Genuinely strong — is the specialist covered, what's the specialist copay.
**Could lose because:** two-sided workflow, hard to demo in three minutes.

### 6. STEADY — Chronic-condition visit prep
**Pitch:** Turns a year of scattered readings into the three things worth discussing.
**Medplum:** `Observation` trends + adherence narrative.
**Could lose because:** dashboards exist; low drama.

### 7. CLEAR — Coverage-aware care preparation
**Pitch:** Know what your plan actually covers before you sit down.
**Stedi:** The whole product — real 270/271, active coverage, deductible remaining.
**Why voice:** Marginal. This is an API round-trip with a voice wrapper.
**Safety:** Benefits ≠ price. Must say so.
**Could lose because:** thin as a standalone; and voice is decoration.

---

# D. SCORING

| Concept | Problem severity | Wedge clarity | Voice-native | Longitudinal value | Medplum | Deepgram | Stedi | Demo impact | 48h feasible | Clinical cred. | Startup | Diff. from scribes | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **1 Prologue** | 9 | 9 | 10 | 10 | 10 | 10 | 7 | 10 | 6 | 9 | 9 | 10 | **109** |
| **2 Reconcile** | 10 | 9 | 9 | 9 | 8 | 9 | 3 | 6 | 9 | 10 | 8 | 9 | **99** |
| **3 Sightline** | 7 | 8 | 6 | 5 | 7 | 6 | 3 | 8 | 7 | 8 | 6 | 8 | **79** |
| **4 Traceback** | 9 | 8 | 8 | 10 | 8 | 8 | 3 | 8 | 9 | 9 | 6 | 9 | **95** |
| **5 Handoff** | 8 | 7 | 7 | 8 | 9 | 7 | 9 | 6 | 5 | 8 | 8 | 8 | **90** |
| **6 Steady** | 7 | 6 | 6 | 9 | 8 | 6 | 4 | 5 | 8 | 8 | 6 | 7 | **80** |
| **7 Clear** | 7 | 8 | 3 | 3 | 6 | 4 | 10 | 6 | 8 | 6 | 6 | 8 | **75** |

## Tradeoffs the totals hide

**Reconcile has the most severe problem and the best clinical credibility, and still loses.** Two-thirds of patients have a med-history error; that is a bigger, better-evidenced problem than "intake is shallow." It loses on demo impact (a diff table) and Stedi fit (none). **That's a real cost, and I'd rather name it than pretend the winner dominates.**

**Traceback scores 95 with the highest longitudinal-value score on the board** — and it is a *feature* of Prologue, not a rival. Its score is evidence that the mechanism is right, which is why Prologue absorbs it as the demo's core beat.

**Clear scores 75 and has the only perfect Stedi score.** That tells you eligibility belongs *in* the winner, not *as* the winner. Voice is decoration when the product is an API call.

**Prologue's weakest score is 48-hour feasibility (6).** It is the most moving parts of the seven. Everything in §M exists to manage that one number.

## Three finalists: **Prologue**, **Reconcile**, **Traceback**

### Stress test

| | Prologue | Reconcile | Traceback |
|---|---|---|---|
| **15-second explain?** | "Voice intake that read your chart first." ✅ | "Voice call that fixes your med list." ✅ | "Asks if your new symptom is your old pill." ✅ |
| **Product or feature?** | Product — the packet is the artifact | Feature of #1 | Feature of #1 |
| **Shows transformation?** | ✅ appointment moves from Thursday to today | ⚠️ shows a corrected list | ⚠️ shows a question |
| **Is voice necessary?** | ✅ the connection lives in free speech | ✅ pills by color/shape | ✅ timing lives in narrative |
| **FHIR meaningful?** | ✅ 8 resource types, draft→final gate | ✅ MedicationStatement vs Request | ✅ DetectedIssue |
| **Insurance genuine?** | ✅ real 270/271, causally motivated | ❌ bolted on | ❌ bolted on |
| **Core runs live?** | ✅ | ✅ | ✅ |
| **Human-review boundary?** | ✅ explicit gate | ✅ | ✅ |
| **What fails on stage** | ASR on "lamotrigine"; retrieval latency; Stedi mock constraints | Drug-name ASR | Little — it's small |
| **What to remove** | Photo capture, patient recap, timeline polish | — | — |

---

# E–F. THE WINNER: **PROLOGUE**

| Requirement | Prologue's answer |
|---|---|
| One primary user | A patient with an appointment and a history |
| One painful pre-visit problem | Intake asks what it knows to ask; it never catches what the patient didn't know to mention |
| One memorable voice interaction | The agent connects a spoken symptom to a charted medication and escalates — mid-conversation |
| One longitudinal retrieval | `MedicationStatement.effectivePeriod.start` vs. symptom onset |
| One FHIR-native output | A `Composition` pre-visit brief, `draft` until signed |
| One real Stedi check | 270/271 eligibility via Medplum's `CoverageEligibilityRequest` |
| One clinician approval | Per-item approve/edit/reject; status → `final` only then |
| One patient visualization | The overlap timeline — med bar, warning window shaded, symptom point inside it |
| One startup wedge | The pre-visit window is owned by form vendors with no clinical reasoning layer |

**Why it beats Reconcile:** reconciliation is a *step inside* Prologue — the lamotrigine catch *is* a medication-history moment. Reconcile's evidence base is the strongest of the three, and that evidence is an argument *for* Prologue, which uses the mechanism and points it at something a judge can feel. Reconcile also cannot motivate a Stedi call, and it cannot demonstrate escalation — the single most important safety behavior to show.

**Why it beats Traceback:** same mechanism, narrower framing, no clinical urgency and no insurance leg. Traceback's output is a question; Prologue's is a changed appointment.

---

# G. PRODUCT SPECIFICATION

**1. Name:** Prologue
**2. Tagline:** *The visit starts before the visit.*

**3. Fifteen seconds:** Prologue calls patients before their appointment and has a real conversation — but unlike every intake form, it has already read their chart. So it asks the question a form couldn't, and sometimes it finds something that shouldn't wait until Thursday.

**4. Thirty seconds:** Patients get about eighteen minutes with a doctor, and get interrupted eighteen seconds in. Meanwhile two-thirds of them have an error in their medication history — almost always something omitted, because nobody asked the right follow-up. Prologue is a voice intake that loads the patient's FHIR record before it says hello. When someone books for "just a rash" and mentions a new prescription, Prologue connects those facts, checks the drug's labeling, flags it for the clinic, and runs a real eligibility check so being seen today isn't a billing surprise. Everything it produces is a draft with sources, and a clinician approves it item by item.

**5. Patient persona — Maria Delgado, 34.** Bipolar II managed by psychiatry. Divalproex 500mg BID for two years; **lamotrigine started 22 days ago**. Books primary care for "itchy rash, arms and chest, few days." High-deductible plan; avoids unnecessary visits. **Does not know lamotrigine can cause a dangerous rash** — different doctor, different problem, different month.

**6. Clinician persona — Dr. Amara Osei, family medicine.** 22 patients/day. Skeptical of AI output that arrives as confident prose. Her trust test: *can I see what the patient actually said, in their words, in one click?*

**7. Job to be done:** "Walk into the room already knowing what matters — and don't make me re-ask what the chart already knows."

**8. Existing workflow:** book → portal form (~50% completion, chart-blind) → front desk verifies insurance → MA rooms patient → physician enters cold, rebuilds history verbally, interrupts at 18s, never learns the lamotrigine start date → rash treated as contact dermatitis → **boxed-warning window closes unnoticed.**

**9. Proposed workflow:** book → consent → chart-aware voice interview → live FHIR charting → connection + red-flag detection → escalation + eligibility check → packet with separated provenance → clinician review → approved content becomes final → patient visual recap.

**10. Core product insight:** *The pre-visit window is the only moment in the encounter with unlimited time and zero clinical attention.* Today it's spent on a form that can't ask a second question.

**11. Magical moment:**
> **Maria:** "…both arms and some on my chest. Itchy. Maybe four days?"
> **Prologue:** "That helps. One thing I want to check — and it may be nothing. Your record shows you started lamotrigine about three weeks ago. Is that right?"
> **Maria:** "Yeah, my psychiatrist added it last month."
> **Prologue:** "Okay. A rash in the first couple of months on lamotrigine is something clinicians want to look at quickly — that's in the drug's own labeling. I'd rather someone from Dr. Osei's office call you today than wait for Thursday."

**12. MVP:** consent capture · streaming voice with keyterm-biased drug names · barge-in · live correctable transcript · chart-conditioned question selection · temporal correlation (med start vs symptom onset) · deterministic red-flag rules → escalation · real 270/271 eligibility · packet with SAID/INFERRED/UNKNOWN separation and citations · clinician per-item review · FHIR writes gated on approval · AuditEvent + Provenance.

**13. Stretch:** photo capture with coaching · patient recap visual · multilingual · PSTN entry · second synthetic patient so a judge can choose.

**14. Non-goals:** ❌ no diagnosis or condition name shown to the patient · ❌ no treatment or medication advice · ❌ no autonomous chart writes · ❌ no ED-vs-not triage decisions · ❌ no image classification · ❌ **no claim of HIPAA compliance** — synthetic data, stated plainly.

**15. Roadmap:** more red-flag protocols → EHR write-back beyond Medplum → payer-side pre-visit benefit checks → outcome measurement (escalations that changed management).

**16. Defensibility:** the asset is **linked pairs of (what the patient said) × (what the chart held) × (what the clinician decided)**. Form vendors have the window but no reasoning layer; symptom checkers have reasoning but no chart; scribes have the chart but arrive after the patient is in the room.

**17. Buyer:** clinic operations / medical director at independent primary-care and specialty groups. Later, health systems via intake replacement.

**18. GTM wedge:** practices already paying for digital intake and getting a form. Land as "intake that catches things," expand to the whole pre-visit window.

**19. Measurable outcome:** escalations surfaced pre-visit that changed management · medication discrepancies caught per 100 intakes · minutes of history-taking returned · time-to-approve per packet · **question-depth parity across ASR-confidence bands** (an agent that asks less of harder-to-understand patients is a bias we intend to measure).

**20. Why a company:** whoever owns the pre-visit conversation owns the structured input to every downstream clinical and financial workflow. That's a platform position, currently held by companies shipping PDFs.

---

# H. CONVERSATION DESIGN

## Principles
Short turns. Acknowledge before asking. Say *why* before anything sensitive. Never say "I think you have." Tolerate silence. Confirm rather than assume. **Barge-in always wins** — if the patient speaks, the agent stops.

## The branches

**H1 — Consent (spoken + on screen)**
> "Hi Maria, I'm an assistant for Dr. Osei's office. Before we start: I'll record this so it can go in your chart, only Dr. Osei's team sees it, and you can skip anything or stop whenever. Is that okay?"

Blocks all capture until affirmative. Writes `Consent`.

**H2 — Purpose, open-ended**
> "Thanks. So — what's going on that brought you in?"

Not "rate your symptom 1–10." The opening statement is the point; **let her finish it.**

**H3 — Retrieval (`get_patient_context`)** fires on first clinical noun. Silent.

**H4 — History-influenced question**
> "Your record shows you started lamotrigine about three weeks ago. Is that right?"
*This question does not exist without the chart. It is the product.*

**H5 — Ambiguity**
> **Maria:** "It's been a few days, I guess?"
> **Prologue:** "Take your best guess — closer to two days or closer to a week?"

**H6 — Contradiction (`flag_unresolved_contradiction`)**
> "Earlier I heard about four days, and just now it sounded like it might've started last weekend. Which is closer?"

**H7 — Barge-in**
> **Prologue:** "And has it changed in appearance since—"
> **Maria:** *(interrupting)* "Oh — my mouth's been sore too."
> **Prologue:** *(stops immediately)* "Thank you for telling me that. That's important."
**Mucosal involvement is a red flag.** The agent abandons the script.

**H8 — Correction**
> **Maria:** "It's lamo-something, I can never say it."
> **Prologue:** "Lamotrigine — I've got it. Does that sound right?"

**H9 — Conservative red-flag check (`check_red_flags`, deterministic)**
> "A couple of quick safety questions. Any blistering or peeling? Any fever? Any trouble swallowing or breathing?"

Never probabilistic. A rule list, not a model.

**H10 — Escalation**
> "Given the timing with your medication and what you said about your mouth, I want someone from the office to call you today rather than waiting for Thursday. Please don't take another dose until you've talked to them. If anything gets worse — trouble breathing, spreading blisters — call 911."

**No diagnosis named.** Urgency routed to the clinic.

**H11 — Spoken summary for confirmation (`generate_visit_summary`)**
> "Let me read back what I have. Rash on both arms and chest, itchy, started about four days ago. Sore mouth since yesterday. Started lamotrigine about three weeks ago, still on divalproex. Anything wrong or missing?"

**H11b — Medication reconciliation (`get_relevant_medications` → `save_confirmed_patient_statement`)**
> **Prologue:** "Before we finish — let me just confirm your medication list. It shows lamotrigine, divalproex, and furosemide. Are you taking all three?"
> **Maria:** "The first two, yeah. But I stopped the furosemide months ago — they told me I didn't need it anymore."
> **Prologue:** "Good to know — I'll flag that so Dr. Osei can update it. **I'm not able to change your list myself.**"

The chart holds a `MedicationRequest` — what was *prescribed*. Her answer becomes a `MedicationStatement` — what is *actually taken*. **FHIR keeps them separate on purpose, and the gap between them is where 91% of harmful discrepancies live.** Most teams will collapse both into one list and lose the discrepancy entirely.

Two boundaries demonstrated in one breath: the agent flags, and says out loud that it cannot change the list itself.

**H12 — Eligibility, causally motivated (`run_eligibility_check`)**
> "Since we're moving this up, let me check your coverage so it isn't a surprise… Your Aetna plan is active, and this visit is covered under your office-visit benefit. You've met about $660 of your deductible. The office can give you an exact estimate — **I'm not able to promise a final number.**"

**H13 — Doorknob question, always last**
> "Last thing — anything else you were hoping to bring up with Dr. Osei? Even if it seems small or unrelated."
*Then wait.* This is the question the 18-second interruption prevents. It goes at the **top** of the clinician's packet.

**H14 — Handoff**
> "I've put all of this together for Dr. Osei to review. She'll go through it before she sees you — nothing goes in your chart until she does."

## Function definitions (`agent.think.functions`)

| Function | When | Arguments | Returns to agent | R/W | Approval? | On failure |
|---|---|---|---|---|---|---|
| `get_patient_context` | First clinical noun | `topic` | Conditions, allergies, recent encounters (compact) | **R** | No | Agent continues **without chart claims** and says so |
| `get_relevant_medications` | Any drug or med-related symptom | `since_days?` | Name, dose, **start date**, status | **R** | No | Same — never guess a med |
| `get_known_allergies` | Before any drug discussion | — | Coded allergy list | **R** | No | Assume unknown; ask directly |
| `save_confirmed_patient_statement` | After patient confirms a fact | `text`, `category`, `onset?` | ack | **W** (draft) | No (draft only) | Queue locally, retry; never lose the transcript |
| `flag_unresolved_contradiction` | Two incompatible statements | `statement_a`, `statement_b` | ack | **W** (draft) | No | Degrade to an open question in the packet |
| `check_red_flags` | Every turn, **deterministic** | `symptoms[]` | `{escalate: bool, rule}` | **R** | No | **Fail closed → escalate.** Safety never fails open |
| `run_eligibility_check` | After escalation or on request | `service_type` | Active?, copay, deductible remaining | **W** (creates request) | No | "I couldn't reach your insurer — the office will check" |
| `generate_visit_summary` | Before close | — | Summary text to speak | **W** (draft `Composition`) | **Yes, downstream** | Read back from local state |
| `create_clinician_review_task` | End of session | `priority` | ack | **W** | — | Retry; alert if it fails |

**Design rule:** every read is fast and non-blocking; every write is draft-only. **No function in this list can produce a final clinical record.** That property is enforced in the API layer, not in the prompt.

---

# I. FHIR MAPPING

| Event | Resource | Why | Created by | State | Modifiable by | Link to encounter | Needs approval |
|---|---|---|---|---|---|---|---|
| Patient identity | `Patient` | Seeded synthetic | Fixture | final | — | — | — |
| Scheduled visit | `Appointment` | The visit being prepared for | Fixture | booked | Staff | — | — |
| Recording consent | `Consent` | Purpose-of-use record for capture | App on affirmative | active | Patient (revoke) | `.provision` | — |
| Structured answers | `QuestionnaireResponse` | Canonical container for interview answers | Agent | **in-progress → completed** | Patient (correct) | `.encounter` | On promotion |
| Confirmed symptom | `Observation` | Discrete clinical finding | Agent | **preliminary** | Clinician | `.encounter` | ✅ → `final` |
| Suspected condition | `Condition` | Only if clinician confirms | **Clinician** | — | Clinician | `.encounter` | ✅ created at approval |
| Patient-reported meds | `MedicationStatement` | Patient-reported ≠ prescribed | Agent | draft | Clinician | `.context` | ✅ |
| Prescribed meds | `MedicationRequest` | Existing record, read-only to us | Fixture | active | — | — | — |
| Allergies | `AllergyIntolerance` | Read; may propose additions | Fixture / agent | draft if new | Clinician | — | ✅ if new |
| Drug-safety signal | `DetectedIssue` | **The correct R4 resource for a CDS finding.** `code = DRG` (v3-ActCode); `severity ∈ {high, moderate, low}`; `implicated` → the MedicationStatement; `evidence.detail` → source | Agent | **preliminary** | Clinician | via `.patient` | ✅ |
| Pre-visit brief | `Composition` | Structured, attested document — supports `.attester` | Agent | **preliminary** | Clinician | `.encounter` | ✅ → `final` |
| The visit | `Encounter` | Container | Fixture/app | planned | — | — | — |
| Coverage | `Coverage` | The plan | Fixture | active | — | — | — |
| Eligibility ask | `CoverageEligibilityRequest` | **Medplum→Stedi documented mapping** | App | active | — | `.patient` | — |
| Eligibility result | `CoverageEligibilityResponse` | Payer's answer, stored verbatim | Stedi via Medplum | active | — | — | — |
| Review work item | `Task` | Assigns the review to a clinician | App | requested → completed | Clinician | `.encounter` | — |
| Approval / correction | `Provenance` | Who attested what, when, from what | On approval | — | immutable | `.target` | — |
| Every access & change | `AuditEvent` | Medplum's documented AI-governance primitive | System | — | immutable | — | — |

**Two notes, stated plainly:**
1. **FHIR validity is not clinical correctness.** A perfectly-schema-valid `Observation` can be wrong. Validation buys interoperability, not truth. The clinician gate is what buys safety.
2. **We do not create `Condition` from the agent.** Asserting a condition is a clinical act. The agent produces `Observation` (what was observed) and `DetectedIssue` (what warrants attention); only an approving clinician creates `Condition`.

---

# J. ARCHITECTURE

```
┌─ Patient mobile web (Next.js) ──────────────┐
│  consent → mic → Deepgram Voice Agent (WS)  │
│  live transcript · correction UI            │
└───────────────┬─────────────────────────────┘
                │ client-side FunctionCallRequest / FunctionCallResponse
                ▼
┌─ Orchestrator (Next.js route handlers) ─────┐
│  /context  /meds  /allergies  (fast reads)  │
│  /statement /contradiction  (draft writes)  │
│  /redflags  ← DETERMINISTIC, not an LLM     │
│  /eligibility  ← server-side function       │
└───────────────┬─────────────────────────────┘
                ▼
┌─ Medplum (FHIR source of truth) ────────────┐
│  reads: Patient, MedicationRequest,         │
│         AllergyIntolerance, Condition       │
│  writes: QuestionnaireResponse, Observation,│
│         MedicationStatement, DetectedIssue, │
│         Composition, Task, Provenance,      │
│         AuditEvent                          │
│  CoverageEligibilityRequest ──► Stedi ──►   │
│         CoverageEligibilityResponse         │
└───────────────┬─────────────────────────────┘
                ▼
┌─ Clinician desktop review (same app) ───────┐
│  queue → 3-pane packet → per-item approve   │
│  approve ⇒ preliminary→final + Provenance   │
└─────────────────────────────────────────────┘
```

## Sequence

```
Patient   Browser      Deepgram        Orchestrator    Medplum      Stedi     Clinician
  │  open link │            │                │            │           │          │
  │──────────►│  consent    │                │            │           │          │
  │           │──────────── Consent write ──►│───────────►│           │          │
  │           │  Settings{keyterms, funcs}   │            │           │          │
  │           │───────────►│                │            │           │          │
  │  "rash…"  │  audio ───►│                │            │           │          │
  │           │◄─ ConversationText           │            │           │          │
  │           │◄─ FunctionCallRequest         │            │           │          │
  │           │   get_relevant_medications   │            │           │          │
  │           │─────────────────────────────►│──query────►│           │          │
  │           │◄──────── FunctionCallResponse ◄───────────│           │          │
  │           │◄─ TTS "started lamotrigine…" │            │           │          │
  │ "yeah"    │──────────►│                 │            │           │          │
  │ (barge-in)│──────────►│ agent stops     │            │           │          │
  │           │  check_red_flags (determ.)   │            │           │          │
  │           │─────────────────────────────►│  ESCALATE  │           │          │
  │           │  run_eligibility_check        │            │           │          │
  │           │─────────────────────────────►│─ CovElig ─►│──270─────►│          │
  │           │◄──────────────────────────────◄───────────│◄──271─────│          │
  │           │◄─ TTS "coverage is active…"  │            │           │          │
  │           │  generate_visit_summary       │            │           │          │
  │           │─────────────────────────────►│─ Composition(preliminary) ─►      │
  │           │  create_clinician_review_task │─ Task ────►│           │          │
  │           │                              │            │           │─────────►│
  │           │                              │            │   approve ◄──────────│
  │           │                              │            │  →final + Provenance │
```

## Latency budget

| Stage | Target | Notes |
|---|---|---|
| STT partial → final | ~300ms | `eot_threshold` tuned for medical speech (people pause mid-sentence) |
| **Context retrieval** | **<100ms, hard budget** | **The one number to show on screen.** Pre-warm the patient's slice at session start so mid-conversation reads are local. |
| Agent response gen | 400–800ms | `reasoning_mode: "low"` for routine turns |
| TTS first byte | ~100–200ms | Aura-2 |
| **Total perceived turn** | **<1.2s** | Below this, it feels like conversation |
| **Eligibility (270/271)** | **1–3s — NOT in the turn budget** | Speak an acknowledgment first, then report. Never let a payer round-trip block a turn. |

**Synchronous (must happen inside the conversation):** context retrieval, medication lookup, red-flag check, contradiction detection. These *change what the agent says next*.
**Asynchronous (after the spoken response):** all FHIR writes, packet assembly, Task creation, AuditEvent. **Never make the patient wait on a write.**

## Decisions and their reasons

- **Client-side functions for reads.** Removes a network hop from the turn budget and keeps the Medplum session token in our backend, called directly from our own route handlers. Server-side would add Deepgram→us→Medplum→us→Deepgram.
- **Server-side function for eligibility.** It's a write with a credential, it's slow, and it doesn't need to be in the turn loop.
- **One agent, not many.** Multiple agents are justified only where independent verification produces *visible* value. We have exactly one such place — the claim-verification pass — and it runs **after** the conversation, not as a second conversational agent.
- **Red flags are code, not a model.** Safety logic must be inspectable and deterministic. A judge can read the rule list.

## Demo fallback path
Every function has a cached response keyed to the demo patient, switchable by one keystroke. If the Deepgram socket fails, the app drops to **text input driving the identical pipeline** — same functions, same FHIR writes, same packet. The demo degrades in fidelity, never in truth.

---

# K. PATIENT AND CLINICIAN OUTPUTS

## Provenance labels — on every material statement

`● PATIENT` said it · `● RECORD` from the chart · `● EVIDENCE` external source · `● INSURANCE` payer data · `◐ INFERRED` model-generated · `✓ CLINICIAN` confirmed

Three visual classes, never blended. `INFERRED` items always carry a rule and a source; an uncited inference **cannot be promoted into the packet**.

## Patient view
**"Here's what I heard"** — editable symptom timeline · relevant history used (and why) · **still unanswered** · plain-language explanation at ~6th-grade reading level · what the clinician will review · coverage and benefits, labeled as benefits not price · **limitations stated in the UI**, not buried.

**No condition names. No probabilities. No advice.**

## Clinician view — three panes
1. **PATIENT SAID** — verbatim, timestamped, **click to play the audio**
2. **PROLOGUE INFERRED** — each with rule, source link, confidence, and `implicated` resources
3. **UNRESOLVED** — contradictions, unanswered questions, and **the doorknob answer at the top**

Plus: chief concern · structured HPI · meds/conditions/allergies · red flags checked *and which ones* · eligibility result · **FHIR diff preview** (proposed resources shown before writing, never silently applied) · per-item **approve / edit / reject**.

**Nothing is pre-checked.** Approval is an action, not a default. Time-to-approve is displayed, because the promise is speed *with* verification.

---

# L. DEMO SCRIPT (4 minutes)

## Synthetic record (seeded in Medplum before the demo)

```
Patient          Maria Delgado, F, 34, DOB per Stedi mock fixture
MedicationRequest divalproex 500mg BID — start 2024-03-11, active
MedicationRequest lamotrigine 25mg daily — start 2026-07-10 (22 days ago), active
Condition        Bipolar II disorder, active
AllergyIntolerance  NKDA
Encounter        prior psych visits ×3
Appointment      Thu Aug 6, primary care — "itchy rash arms and chest"
Coverage         Aetna PPO  ← MUST match a Stedi predefined mock request
```

> ⚠️ **Build the patient around Stedi's mock fixture, not the reverse.** Test mode does not support custom mock data or payer selection. Aetna is one of four available mock payers. Verify the exact accepted subscriber identity **on day one** and make Maria match it.

| Time | Beat |
|---|---|
| **0:00–0:15** | **Cold open.** *"Maria books a routine visit for an itchy rash. All synthetic data. Watch what her intake catches."* Phone screen mirrored. |
| **0:15–0:35** | **Consent, out loud.** Screen + spoken. *"Twenty seconds most demos skip."* |
| **0:35–1:25** | **Conversation.** Open question — she tells her story uninterrupted. Transcript streams. Function-call panel shows `get_relevant_medications` firing with **a live latency readout**. Then: *"Your record shows you started lamotrigine about three weeks ago — is that right?"* **Narration: "Nobody wrote that question. It came from her chart."** |
| **1:25–1:45** | **Barge-in.** She cuts the agent off — *"my mouth's been sore too."* Agent stops mid-word. `check_red_flags` fires. **Mucosal involvement.** |
| **1:45–2:10** | **THE MOMENT.** Timeline snaps up: divalproex bar, lamotrigine bar with weeks 2–8 shaded, rash point *inside* the window. Agent escalates — call today, don't take another dose, 911 if worse. **No diagnosis named.** |
| **2:10–2:30** | **Eligibility, causally motivated.** *"Since we're moving this up, let me check your coverage."* Real 270/271 → *"Aetna active, covered, $660 of deductible met. The office can give an exact estimate — I can't promise a final number."* Raw response flashed for 1s. **Preempt:** *"Stedi test mode, pre-registered member — same call a production integration makes."* |
| **2:30–2:50** | **Confirm-back.** Agent reads the summary; Maria corrects one detail; the correction lands in the record as an amendment. Then the **doorknob question** — and she raises something new. |
| **2:50–3:35** | **Clinician review.** Dr. Osei's queue, escalation pinned. Three panes. She clicks a citation — **Maria's actual voice plays.** She rejects one weak inference, approves the rest. `Composition` flips **preliminary → final**, `Provenance` written, on screen. *"Nothing reached the chart without her."* |
| **3:35–4:00** | **Before / after + close.** *Before:* Thursday, 15 minutes, rash treated as contact dermatitis, nobody connects the prescription, the warning window closes. *After:* seen today, psychiatry looped in, coverage known. — *"Every intake form asks what it knows to ask. Maria didn't know her rash and her prescription were the same story. Prologue did, because it read her chart before it said hello."* |

## The runtime-intelligence moment
The judge-facing proof is **not** the scripted rash line. It's this: **hand the mic to a judge and let them change one fact** — say a different drug, or a different onset. The retrieval fires live, the question changes, the timeline redraws. If we only ever demo Maria, we've demoed a recording.

## Backups
| Failure | Response |
|---|---|
| ASR mangles "lamotrigine" | Transcript is on screen and correctable — *"and this is exactly why the patient can fix the record."* **Turns the failure into the feature.** |
| Voice socket dies | Text input, identical pipeline. Say so plainly. |
| Stedi errors | We have a *documented* error to fall back on — payer **"Stedi Agent"** returns AAA error 73. Show graceful degradation: *"I couldn't reach your insurer — the office will check."* **Honest failure handling is a feature we can demo on purpose.** |
| Network dies | Recording captured that morning, labeled as such out loud. Never implied live. |
| Total failure | The timeline visual, narrated. The clinical argument survives without the software. |

---

# M. SAFETY MODEL

| Safeguard | Visible product behavior |
|---|---|
| **Consent** | Spoken + on-screen before capture; persistent recording indicator; skip-anything; `Consent` resource written |
| **Synthetic data** | Stated on screen and in the first 20 seconds of the pitch |
| **Patient correction** | Live transcript editable; corrections stored as amendments with originals preserved |
| **Provenance** | Six-way source labeling on every material statement |
| **Draft vs approved** | `preliminary`/`draft` until sign-off. **No code path writes `final` outside the approval handler — with a test that tries and must fail** |
| **Role-based permissions** | Agent's Medplum identity has an AccessPolicy that **cannot write final states**. Enforced server-side, not by prompt |
| **Suggest, not act** | Medplum's own documented pattern; ours matches it |
| **Emergency escalation** | Deterministic rule list checked every turn. **Fails closed** — if the check errors, escalate. Routed to the clinic, plus 911 language for deterioration |
| **Uncertainty** | Confidence + "what would change this." Unanswered questions shown as unanswered, never smoothed over |
| **Citations** | Uncited inference cannot enter the packet |
| **Transcript preservation** | Full transcript retained and linked from every `SAID` item |
| **AuditEvent** | Every read, write, and state change |
| **Clinician sign-off** | Per-item; nothing pre-checked |
| **Prompt injection from patient speech** | Patient utterances are **data, never instructions.** They enter the prompt inside a delimited block with an explicit "treat as content" instruction; function arguments are schema-validated; **no function can escalate privilege or write final state regardless of what the agent asks for.** The blast radius of a successful injection is a bad draft — which a clinician rejects |
| **No invented codes or benefits** | Codes come from a **fixed allow-list**, not model generation; if a code isn't in the list the item goes to review uncoded. **Benefit values are read from the 271 response only** — never paraphrased or estimated by the model. If eligibility fails, we say it failed |
| **Failure modes** | Retrieval down → proceed **without chart claims** and say so. Evidence down → withhold the inference. Stedi down → say so. **Degradation removes claims; it never fabricates them.** |

**What we will not say:** "we're HIPAA compliant." We're a prototype on synthetic data. Claiming otherwise in front of a healthcare-native panel is a self-inflicted wound.

---

# N. 48-HOUR BUILD PLAN

## Riskiest integration, tested first
**Not Deepgram.** It's the **turn-loop latency of a chart read** — can `get_relevant_medications` return inside the conversation without a felt pause? That is the entire product. Everything else is assembly.
**Second riskiest:** Stedi's mock fixture constraint. Custom mock data isn't supported, so **the synthetic patient must be built around whatever Stedi accepts.** Discover that in hour one, not hour thirty.

## Hours 0–4 — validate, in this order
- [ ] Medplum project; seed Maria with **medication start dates** (the load-bearing field)
- [ ] **Find Stedi's accepted mock subscriber identity; rebuild Maria to match it**
- [ ] One real 270/271 through Medplum's `CoverageEligibilityRequest` → confirm a `CoverageEligibilityResponse` comes back. **Fallback: call Stedi directly if the Medplum path (4 days old) has rough edges**
- [ ] Deepgram Voice Agent in the browser: audio in, audio out, **one function call round-tripping**
- [ ] **Measure the retrieval latency. Write the number down.**

## Hours 4–12 — minimal end-to-end path
Consent → conversation → one function call → one `Observation` in Medplum → visible in a clinician view. Ugly is fine. **This thin thread must be complete by hour 12** or scope gets cut.

## Hours 12–24 — the conversation and its FHIR output
Full function set · keyterms loaded with the drug list · `eot_threshold` tuned for barge-in · temporal correlation · deterministic red-flag rules + escalation · SAID/INFERRED/UNKNOWN separation **in the data model from the start, not retrofitted** · `QuestionnaireResponse` + `Observation` + `DetectedIssue` + `Composition(preliminary)`.

## Hours 24–36 — review and visualization
Clinician queue · three-pane packet · audio playback seeked by transcript timestamp · per-item approve/reject · **preliminary→final + Provenance + AuditEvent** · the overlap timeline · patient recap.

## Hours 36–44 — reliability and fallbacks
Cached response for every network call, one-keystroke switch · text-input mode · the "Stedi Agent" error path as a *deliberate* demo · test that `final` is unreachable outside approval · **run the whole flow on a phone hotspot.**

## Hours 44–48 — rehearse and submit
Five full run-throughs including every failure line · **submit the Google Form early** — put in title, description, repo, team names first and leave only the demo link. *Teams lose to the form, not the code.*

## Parallelizable
Voice/agent · FHIR/data · clinician UI + timeline. **Serial dependency:** seeded fixture → retrieval → everything.

## Cut order
1. Photo capture 2. Patient recap 3. Timeline polish 4. Multi-turn depth 5. Eligibility → cached response, honestly captioned
**Never cut:** consent · the chart-conditioned question · escalation · SAID/INFERRED separation · the approval gate.

## Must be real
Streaming voice · chart-conditioned question selection · temporal correlation · red-flag rules · statement/inference separation · the approval gate and FHIR states · **the eligibility call**.
## May be deterministic synthetic
Patient history · evidence corpus (curated, disclosed) · clinician identity.
## Must never be faked
**The chart-conditioned question.** It is the innovation. If that's scripted, there is no product.

## Test checklist
- [ ] 10 full conversations; **ASR accuracy on drug names specifically**
- [ ] Retrieval latency measured under demo network conditions
- [ ] Red flag fires on mucosal involvement **every time**
- [ ] Barge-in interrupts TTS within 200ms
- [ ] Automated check: no condition name ever reaches patient output
- [ ] Automated check: `final` unreachable outside the approval handler
- [ ] Every inference resolves to a citation
- [ ] Correction persists as an amendment
- [ ] Every network call has a cached fallback
- [ ] Works on hotspot

## Demo checklist
- [ ] Audio through the venue PA, not laptop speakers
- [ ] Phone screen mirroring tested on the actual projector
- [ ] Font sizes legible from the back
- [ ] Cached path one keystroke away
- [ ] "Synthetic data" said in the first 20 seconds
- [ ] Honesty caveats rehearsed as lines, not improvised
- [ ] **Google Form submitted before 5:00pm**

---

# O. FINAL PITCH

**Prologue** — *The visit starts before the visit.*

**One line:** A voice intake that has already read your chart, so it catches what you didn't know to mention.

**Problem:** Patients get about eighteen minutes with a doctor and are interrupted eighteen seconds in. Two-thirds have an error in their medication history — almost always an omission, because nobody asked the right follow-up.

**Why existing intake fails:** A form is a fixed graph. It cannot ask question *n+1* based on answer *n*, cannot notice a contradiction, and has never seen your chart. Symptom checkers reason but are chart-blind. Ambient scribes have the chart but arrive after you're already in the room.

**The story:** Maria books for an itchy rash. Prologue calls first, loads her FHIR record, and asks about the anticonvulsant she started three weeks ago. She mentions a sore mouth. Prologue escalates to the clinic — today, not Thursday — runs a real eligibility check so it isn't a billing surprise, and hands her doctor a packet where every statement shows whether it came from Maria, her chart, or the model. Dr. Osei rejects one inference and approves the rest.

**Why voice:** Because answer *n* determines question *n+1*, and because Maria mentioned "four days" and "last month" in the same breath — connecting those is the product.

**Why Medplum:** FHIR is the substrate that makes retrieval and review possible. And Medplum's own AI guidance prescribes **"can suggest, but not act"** with AuditEvent logging and role-scoped agent permissions. We didn't invent our safety model — we built to the platform's.

**Why Stedi:** Because "your coverage is active and you've met $660 of your deductible" is a real X12 271 answer, and "this will cost $340" is not. We do the first and refuse the second.

**Responsible-AI boundary:** No diagnosis to the patient, ever. Deterministic safety rules that fail closed. Every inference cited. Nothing final without a clinician, enforced in the API layer, not the prompt.

**Business:** Whoever owns the pre-visit conversation owns the structured input to every downstream clinical and financial workflow. That position is currently held by companies shipping PDFs.

**Built here:** A working voice agent with live function calling into a real FHIR store; chart-conditioned questions with measured sub-100ms retrieval; deterministic escalation; a real 270/271; a packet that structurally separates what was said from what was inferred; and a review gate where FHIR status cannot reach `final` without a signature.

**Next:** More protocols. Write-back beyond Medplum. Measuring escalations that changed management.

**Closing (30s):**
> "Maria booked a routine appointment for an itchy rash. She had no idea it might be connected to a prescription a different doctor gave her last month — because nothing in her care connects those two facts. Not the scheduler, not the intake form, not her memory. Prologue read her chart before it asked its first question, noticed the timing, and got her a phone call today instead of an appointment Thursday. It didn't diagnose her. It didn't prescribe anything. It didn't touch her chart until her doctor said so. It just made sure the right person knew the right thing at the right time. **That's the whole product.**"
