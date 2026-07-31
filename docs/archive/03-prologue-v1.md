# Prologue — Product Design Document

**"The visit starts before the visit."**

YC × Medplum Agentic Healthcare Hackathon · Aug 1, 2026 · Y Combinator SF

---

# PHASE 1 — THE OPPORTUNITY

## Where today's pre-visit workflow fails

*All figures below verified against primary sources; links inline.*

**The visit is too short, and the history part gets crushed first.** Average PCP face time is **~18 minutes** ([Medical Care analysis of 21M+ visits](https://www.healio.com/news/primary-care/20210121/average-primary-care-exam-lasts-less-than-20-minutes)); roughly 1 in 4 visits runs under 12. Meanwhile physicians spend **~2 hours on EHR and desk work for every 1 hour of face time**, plus 1–2 more after hours ([Sinsky et al., *Annals of Internal Medicine*](https://www.acpjournals.org/doi/10.7326/M16-0961)) — family physicians average **86 minutes of nightly "pajama time"** ([AMA](https://www.ama-assn.org/practice-management/digital-health/family-doctors-spend-86-minutes-pajama-time-ehrs-nightly)).

**Patients don't get to finish their opening sentence.** The canonical finding: physicians interrupt the patient's opening statement after a mean of **18 seconds**, and patients complete it uninterrupted in only **23%** of visits — and interrupted concerns are almost never revisited (1 of 52 interviews) ([Beckman & Frankel, 1984](https://pmc.ncbi.nlm.nih.gov/articles/PMC1783704/)). The **"doorknob complaint"** — the real concern raised on the way out — is a documented consequence, associated with worsening symptoms and more follow-up visits ([AAFP review](https://www.aafp.org/pubs/afp/issues/2018/0701/p52.html), [PMC5803466](https://pmc.ncbi.nlm.nih.gov/articles/PMC5803466/)).

**Medication history is the single most broken input — and the failure is specifically in the asking.** Up to **67% of patients have at least one error in their admission medication history**, and **91% of discrepancies are omissions** — traceable to how the history was taken, not to downstream reconciliation logic ([PMC2518028](https://pmc.ncbi.nlm.nih.gov/articles/PMC2518028/)). *This is the most important statistic in this document:* the defect is at the "ask the patient what they actually take" step, which is precisely a **conversational interviewing problem**.

**Patients don't retain what they're told.** Patients recall about **49%** of decisions and recommendations from a visit — **38% for those without a high-school diploma versus 65% with a college degree** ([Brown University study](https://www.techtarget.com/patientengagement/news/366585219/Patient-Recall-Suffers-as-Patients-Remember-Half-of-Health-Info)). Only **12% of US adults have proficient health literacy**; ~36% are basic or below ([NAAL](https://nces.ed.gov/naal/health_results.asp)). A text-heavy form is a comprehension tax levied on exactly the patients who can least afford it.

**Patients don't know what they don't know.** A patient booking for a rash has no idea the anticonvulsant they started three weeks ago carries a boxed warning for exactly that. **Nobody in the current workflow makes that connection before the appointment** — not the scheduler, not the form, not the patient.

## Why forms and scribes don't solve it

| | Scale / evidence | What it can't do |
|---|---|---|
| **Digital intake forms**<br/>[Phreesia](https://ir.phreesia.com/news/news-details/2025/Phreesia-Announces-First-Quarter-Fiscal-2026-Results/default.aspx), Luma, Notable, Klara, Yosi | Phreesia alone enabled **~170M patient visits in 2024 — roughly 1 in 7 US visits**, 4,700+ orgs | Branching *forms* — checkbox logic delivered by portal/SMS. Cannot ask an unscripted follow-up, notice a contradiction, or connect an answer to the chart. Voice appears only for scheduling logistics, never clinical history. |
| **Ambient scribes**<br/>Abridge, Ambience, Suki, Nabla, Freed | Abridge ~30% share, Best-in-KLAS 2025+2026 | **Arrive after the patient is already in the room.** They observe; they don't prepare. Nothing they do changes what is known when the visit starts. |
| **Symptom checkers**<br/>[Ada, K Health, Buoy](https://pmc.ncbi.nlm.nih.gov/articles/PMC7745523/), Infermedica, Clearstep | Top-3 accuracy: Ada 70.5%, Buoy 43.0%, K Health 36.0% vs. **GP 82.1%**. Across the literature, **primary-diagnosis accuracy is only 19–37.9%**, and one cohort **missed >40% of emergencies** ([systematic review](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9385087/)) | **Chart-blind by architecture.** They don't know your medications, so they cannot make the one inference that matters. And the category carries a hard, published accuracy ceiling. |
| **Healthcare voice agents**<br/>[Assort](https://www.fiercehealthcare.com/ai-and-machine-learning/assort-health-scores-120m-series-c-scale-voice-ai-agent-platform-healthcare) ($222M raised, $1.2B val), [Hyro](https://www.prnewswire.com/news-releases/hyro-raises-45m-strategic-growth-round-to-accelerate-ai-agent-adoption-in-healthcare-302589268.html) ($95M), [Hello Patient](https://www.fiercehealthcare.com/health-tech/hello-patient-secures-225m-investors-bet-ai-voice-agent-growth) ($29M), Parakeet | A well-funded 2025–26 wave | **Uniformly access-layer.** They compete on call abandonment and first-call resolution. Not one claims clinical pre-visit interviewing. They answer the phone; they don't gather the history. |

**The white space, and why it exists.** Nobody has shipped **conversational pre-visit clinical interviewing conditioned on the patient's actual longitudinal record.** Forms are chart-blind by construction; symptom checkers are chart-blind by architecture; scribes have the chart but arrive too late; voice agents have neither the chart nor a clinical purpose.

The gap is not an oversight — it's **structural**. Money flooded into "answer the phone" precisely because clinical liability and the published accuracy ceiling keep funded players in the safer logistics lane. **The way through is not better diagnosis — it's refusing to diagnose at all.** A tool that surfaces information *for a clinician to review*, and never outputs a condition to a patient, sidesteps that wall the same way Aysa and Miiskin do in dermatology by positioning as educational rather than diagnostic.

## Where voice earns its place

Voice is not a nicer input method here. It does three things a form structurally cannot:

1. **It permits digression.** "How long has it been going on?" gets a date from a form and a *story* from a person — and the story contains the useful part.
2. **It supports follow-up.** The value is entirely in question *n+1* being determined by answer *n*. That's a conversation, not a questionnaire.
3. **It lowers the floor.** Low health literacy, limited English, arthritis, poor vision, elderly patients — all of them do better talking than typing.

## Where longitudinal history changes everything

An agent that knows the chart can ask questions that are impossible otherwise: *"You mentioned a cough — I see you started lisinopril in March. Has the cough been there since around then?"* That question cannot be pre-written. It exists only at the intersection of what the patient just said and what the record contains.

## The risks, named

| Risk | Reality |
|---|---|
| **Consent / recording** | California is an **all-party consent** state (Penal Code §632). Sharp HealthCare was sued in Jan 2026 over AI-scribe recording without adequate patient consent. Consent must be a product surface, not a checkbox in a ToS. |
| **Scope creep into diagnosis** | An AI telling a patient what they have, pre-visit, plausibly fails the FDA Non-Device CDS carve-out — which requires the intended *clinician* user to independently evaluate the basis. The Jan 2026 final CDS guidance uses drug-interaction alerts as its example of exempt, non-device CDS. |
| **Anxiety induction** | Telling a patient "this could be Stevens-Johnson syndrome" is harmful. Telling the *clinic* "see this person today" is not. **The escalation must be routed to the clinic, not narrated to the patient.** |
| **ASR failure on accent/speech** | Medical terms + accents + hearing loss. Mitigate with keyterm biasing, always-visible transcript, and a correction path. |
| **Bias** | An agent that asks fewer follow-ups when it understands someone less well produces worse care for exactly the patients already underserved. Measure question-depth parity. |
| **Automation bias in reviewers** | If the packet looks authoritative, clinicians rubber-stamp it. Design against this: separate what the patient *said* from what the model *inferred*, visually and structurally. |

## The strongest demo territory

Not "we transcribed the conversation." Not "we generated a plan." **The moment the agent connects something the patient said to something in their chart that the patient did not know was relevant — and escalates.** That is impossible for every competitor above, requires all four core principles at once, and is legible to a non-medical judge in five seconds.

---

# PHASE 2 — EIGHT CONCEPTS

### 1. PROLOGUE — Chart-aware adaptive interviewing
**Pitch:** A voice intake that has already read your chart, so it asks the question no form could.
**User:** Any patient with a booked appointment and prior records.
**Problem:** Intake collects what it knows to ask for. It never catches what the patient didn't know to mention.
**Magical moment:** Patient books for a rash. Agent knows lamotrigine started 3 weeks ago, sees valproate co-prescribed, recognizes the boxed-warning window — and escalates to the clinic.
**Why voice:** The connection only exists because the patient volunteered timing in free speech.
**Needs:** Med list w/ start dates, conditions, allergies, prior encounters.
**Output:** Pre-visit packet — patient statements, model inferences (labeled), open questions, escalation flags.
**Safety boundary:** Never names a diagnosis to the patient. Routes urgency to the clinic. Everything is draft until clinician approval.
**Novel:** The only concept here where the chart *changes the interview itself*.
**Demo:** Consent → conversation → live chart panel → connection detected → escalation → clinician review/approve.
**Buildable:** Yes — the whole loop.

### 2. RECONCILE — Voice medication reconciliation
**Pitch:** A three-minute phone call that makes the med list true.
**User:** Polypharmacy patients; pre-op; post-discharge.
**Problem:** The chart's med list is reliably wrong, and nobody has time to fix it.
**Magical moment:** "Your chart lists five. You've described four and added two the chart doesn't have. Let's walk through the differences."
**Why voice:** Patients describe pills by color and shape, not names — free speech captures that; a form doesn't.
**Output:** A reconciled list with per-item provenance and a discrepancy report.
**Safety boundary:** Proposes; never edits the chart directly.
**Novel:** Med rec is universally acknowledged as broken and nobody has done it conversationally at the patient's convenience.
**Demo:** Strong but narrow — a diff table is less visceral than an escalation.
**Buildable:** Very. Possibly the safest build.

### 3. SIGHTLINE — Guided dermatology capture
**Pitch:** Coaches the patient to photograph the rash properly, then asks the derm history a form never gets.
**User:** Patients with a visible complaint.
**Problem:** Derm visits fail on bad photos and missing history (onset, spread, itch, exposures, new drugs).
**Magical moment:** Real-time coaching — "move a little closer, and put something for scale beside it."
**Why voice:** Hands are busy holding a camera.
**Output:** Standardized image set + structured derm history.
**Safety boundary:** **Explicitly does not classify the lesion.** Documentation aid only — this is the line between a device and a not-device.
**Novel:** Capture quality as the product, rather than a classifier.
**Demo:** Very visual, very legible.
**Buildable:** Yes, though camera coaching is fiddly.

### 4. SIDE EFFECT — "Is it the drug?"
**Pitch:** Investigates whether a new symptom is a known effect of an existing medication.
**User:** Patients on chronic meds with a new complaint.
**Problem:** Drug-induced symptoms get worked up as new disease — the classic ACE-inhibitor cough that earns a chest X-ray and a pulmonology referral.
**Magical moment:** "Your cough started within a month of beginning lisinopril. That's a documented effect in up to 1 in 5 patients. Worth asking your doctor."
**Why voice:** Timing emerges in narrative, not in fields.
**Output:** Temporal correlation + labeled citation + a question for the physician.
**Safety boundary:** Frames as a *question*, never an instruction. Never says stop taking anything.
**Novel:** High clinical value, low technical complexity.
**Demo:** Strong — but it's a feature of #1, not a product.
**Buildable:** Very.

### 5. TRENDLINE — Chronic-condition visit prep
**Pitch:** Turns twelve months of scattered readings into the three things worth discussing.
**User:** Diabetes, hypertension, CHF patients.
**Problem:** Chronic visits burn their first half reconstructing what happened since last time.
**Magical moment:** Home readings and labs assemble into a timeline; the agent asks about the one anomalous stretch.
**Why voice:** Adherence and barriers surface conversationally, not on forms.
**Output:** Trend visualization + adherence narrative + agenda.
**Safety boundary:** No titration advice.
**Novel:** Moderate — trend dashboards exist.
**Demo:** Pretty but low drama.
**Buildable:** Yes, if data is seeded.

### 6. TEACHBACK — Comprehension and visual explanation
**Pitch:** Explains the plan back in the patient's own words and checks whether it landed.
**User:** Post-visit patients (**note: this is post-visit, off-theme**).
**Problem:** Patients forget or misremember a large share of what they're told.
**Magical moment:** Patient explains it back; the agent detects a misunderstanding and re-explains differently.
**Why voice:** Teach-back is inherently spoken.
**Safety boundary:** Explains only what the clinician approved.
**Novel:** Real, but **wrong side of the appointment** for this brief.
**Buildable:** Yes.

### 7. CLEARANCE — Cost and coverage preparation
**Pitch:** Tells the patient what the likely visit will cost before they walk in.
**User:** High-deductible and uninsured patients.
**Problem:** Cost is invisible until the bill arrives.
**Magical moment:** Live X12 270/271 eligibility during the call.
**Why voice:** Marginal — this is an API round-trip.
**Safety boundary:** Estimate only, never a quote.
**Novel:** Real EDI is rare at hackathons; nobody fakes a 271.
**⚠️ Honest limits:** A **271 does not reliably answer "is prior auth required"** — that's precisely why HL7 built Da Vinci CRD. And a sandbox only clears pre-registered test patients, so a judge's "try a different payer" probe **visibly fails**. Strong as a *component*, dangerous as a *product*.
**Buildable:** Yes, with disclosure.

### 8. SECOND READER — The clinician review gate
**Pitch:** An adversarial second pass that checks the AI's own draft before a human sees it.
**User:** The reviewing clinician.
**Problem:** AI generates faster than humans can verify; either nobody checks or no time is saved.
**Magical moment:** The reviewer flags one claim as unsupported and edits it live; FHIR status flips `draft` → `active` only on signature.
**Why voice:** Not voice-native at all.
**Safety boundary:** *It is the safety boundary.*
**Novel:** Everyone renders "peer reviewed by experts" as a static badge with nothing behind it.
**Buildable:** Yes.
**Verdict:** Essential **layer**, not a standalone product. Fold into the winner.

---

# PHASE 3 — SCORING

| Concept | Clin. use | Pat. use | Orig. | Voice-native | Wow | Feasible | E2E demo | Safety | Defens. | Judge clarity | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **1 Prologue** | 9 | 8 | 9 | 10 | 10 | 7 | 9 | 9 | 9 | 9 | **89** |
| **2 Reconcile** | 10 | 7 | 8 | 9 | 6 | 9 | 9 | 10 | 8 | 7 | **83** |
| **3 Sightline** | 7 | 8 | 7 | 6 | 8 | 7 | 8 | 9 | 6 | 9 | **75** |
| **4 Side Effect** | 9 | 8 | 7 | 8 | 8 | 9 | 8 | 8 | 6 | 9 | **80** |
| **5 Trendline** | 7 | 7 | 4 | 6 | 5 | 8 | 7 | 9 | 5 | 7 | **65** |
| **6 Teachback** | 6 | 9 | 6 | 9 | 6 | 8 | 7 | 9 | 5 | 8 | **73** |
| **7 Clearance** | 5 | 9 | 7 | 3 | 7 | 6 | 6 | 7 | 6 | 10 | **66** |
| **8 Second Reader** | 9 | 3 | 9 | 1 | 5 | 8 | 6 | 10 | 8 | 6 | **65** |

## Tradeoffs the totals hide

**Reconcile scores highest on clinical usefulness and safety and still loses.** It is the more *responsible* product and the safer build. It loses because a diff table doesn't make a room react, and hackathons are decided in three minutes. That is a real cost, and it should be acknowledged rather than pretended away.

**Second Reader scores 65 and is still mandatory.** Standalone it's a queue with an approve button. As a *layer inside* Prologue it is the entire regulatory answer. Low totals can indicate "wrong unit of analysis," not "low value."

**Clearance has the best judge-clarity score (10) and the worst voice score (3).** Everyone understands "what will this cost." Almost nobody should build a product on a 271.

**Prologue's weakest score is feasibility (7)** — it's the most moving parts. That's the thing to manage, and it's why Phase 9 cuts aggressively.

## Stress-testing the finalists

### Prologue

| Challenge | Answer |
|---|---|
| **Why dismiss it?** | "This is a symptom checker with the chart bolted on." | **Rebuttal:** symptom checkers map symptoms→conditions and tell the patient. We map patient statements→chart facts and tell the *clinic*. Different output, different recipient, different risk class. |
| **Feature or product?** | Product. The packet is the artifact and the chart-conditioned interview is the moat. But #4 and #7 *are* features of it — don't let them masquerade as pillars. |
| **Synthetic data?** | Yes, entirely — and it should be. Real PHI would be irresponsible here. |
| **Hardest dependency** | Real-time retrieval fast enough not to stall the conversation. A 700ms lookup mid-sentence is felt on a voice call in a way an on-screen spinner never is. |
| **Live demo failure** | ASR mangles "lamotrigine." Mitigate with keyterm biasing + visible transcript + a scripted fallback. |
| **Genuine value vs. theater** | The connection is genuine: temporal correlation against a documented boxed warning is real clinical reasoning, not vibes. **The theater risk is the packet's prose** — resist generating narrative that reads authoritative. |
| **Cuttable** | Cost/coverage. Visualization polish. Multi-turn negotiation. **Not** the escalation and **not** the review gate. |

### Reconcile

| Challenge | Answer |
|---|---|
| **Why dismiss it?** | "Administrative, not clinical." Judges undervalue plumbing. |
| **Feature or product?** | Honestly, a feature of Prologue — reconciliation is a *step* in a chart-aware interview. |
| **Hardest dependency** | Drug-name ASR and RxNorm normalization. "Metoprolol" and "metolazone" are one phoneme apart and clinically unrelated. |
| **Demo failure** | Any name mis-transcription visibly breaks the core promise. |

### Sightline

| Challenge | Answer |
|---|---|
| **Why dismiss it?** | "So it's a camera app." And the moment it hints at what the lesion *is*, it's a regulated device. |
| **Hardest dependency** | Real-time image-quality feedback. |
| **Demo failure** | Venue lighting ruins the photo on stage. |
| **Cuttable** | Everything except the coaching loop. |

---

# PHASE 4 — THE WINNER

## Prologue

**One user:** a patient with an appointment and a history.
**One problem:** intake asks what it knows to ask; it never catches what the patient didn't know to mention.
**One unforgettable interaction:** the agent connects a spoken symptom to a charted medication and escalates.
**One reviewed output:** a pre-visit packet a clinician approves in under a minute.
**One safety model:** patient statements and model inferences are structurally separate; urgency routes to the clinic, not the patient; nothing enters the chart without a signature.

### Why it beats the other finalists

**Over Reconcile.** This one deserves a real argument, because the evidence base points at Reconcile hard: up to **67% of patients have a medication-history error**, **91% of discrepancies are omissions**, and those omissions trace to *how the history was taken* — a conversational problem with no consumer-facing product addressing it. On evidence density, Reconcile wins.

It loses on two grounds. First, **its output is a diff table** and Prologue's is *"call this patient today"* — both useful, only one unforgettable in a three-minute window. Second, and more importantly: **Prologue already contains it.** The lamotrigine catch *is* a medication-history moment — the agent reconciles what Maria says against what the chart holds and finds a safety signal in the gap. Reconcile is the mechanism; Prologue is the mechanism pointed at something a judge can feel. The med-rec evidence isn't an argument against this pick, it's the evidence base *for* it.

**Over Sightline:** dermatology capture is the most demoable *image*, but it's a narrow complaint type and the interesting version — classification — is exactly the version that becomes a regulated device. Sightline survives inside Prologue as a capture step.

**And it answers the brief's own sentence.** The organizers wrote *"even something apparently simple such as a rash."* Prologue takes that exact example and shows why "simple" was the wrong word — which is a better answer than a more impressive demo of a different question.

---

# PHASE 5 — PRODUCT DESIGN

## 1. Name and tagline
**Prologue** — *The visit starts before the visit.*

## 2. Elevator pitch (30s)
Patients get fifteen minutes with a doctor, and the first several go to reconstructing history the clinic already has. Prologue calls the patient beforehand and has a real conversation — but unlike every intake form, it has already read their chart. So when someone books for "just a rash" and mentions they started a new medication last month, Prologue connects those two facts, checks it against the drug's labeling, and tells the clinic before the appointment. Everything it produces is a draft with citations, separated into what the patient said and what the system inferred, and a clinician approves it in under a minute.

## 3. Patient persona
**Maria Delgado, 34.** Bipolar II, managed by psychiatry. Started lamotrigine ~3 weeks ago; on divalproex for two years. Books a routine primary-care slot for "a rash on my arms and chest, itchy, a few days." Works retail, high-deductible plan, avoids unnecessary visits. **Does not know lamotrigine can cause a dangerous rash.** Has no reason to connect the two — different doctor, different problem, different month.

## 4. Clinician persona
**Dr. Amara Osei, family medicine.** 22 patients/day, 15-minute slots, charts at night. Skeptical of AI output that arrives as confident prose. Will use something that saves her time *only* if she can verify it faster than she could redo it. **Her trust test: can I see what the patient actually said, in their words, in one click?**

## 5. Problem statement
The pre-visit window is the only moment in the encounter with unlimited time and zero clinical attention. Today it is wasted on forms that cannot ask a second question.

## 6. Current workflow and its failures

| Step | Failure |
|---|---|
| Patient books "rash" | Reason-for-visit is a free-text string nobody reads |
| Portal form 24h prior | ~50% completion; fixed questions; chart-blind |
| Front desk verifies insurance | Administrative only |
| MA rooms patient, takes vitals | 90 seconds, no history depth |
| Physician enters cold | Rebuilds history verbally, interrupts early, misses the medication connection entirely |
| Rash worked up as contact dermatitis | Topical steroid, return if worse. **The boxed-warning window closes unnoticed.** |

## 7. Proposed workflow
Booking → consent → **chart-aware voice interview** → live structured charting → connection/red-flag detection → **escalation to clinic if warranted** → packet generation with separated evidence → **clinician review and approval** → approved content enters chart → patient receives plain-language summary.

## 8. Patient journey
1. SMS: *"Dr. Osei's office — a few questions before Thursday. About 5 minutes. Tap to start."*
2. Consent screen: what's recorded, who sees it, how to delete, how to skip any question.
3. Voice conversation, transcript visible and correctable throughout.
4. Agent summarizes; patient confirms or corrects.
5. **If escalation:** *"I want a nurse from Dr. Osei's office to call you today — I've flagged this as time-sensitive. Please don't take any more doses until you've spoken with them."* — no diagnosis named.
6. Plain-language recap with a timeline and the questions to ask.

## 9. Clinician journey
1. Queue shows Maria's card, **escalation badge at top**.
2. Card opens to three panes: **What Maria said** (verbatim, timestamped, playable) · **What Prologue inferred** (each with citation and confidence) · **Open questions**.
3. Every inference has a source chip; clicking plays the audio.
4. Approve / edit / reject per item. Rejection requires no explanation but is logged.
5. On approval: `Composition` + `Condition` + `DetectedIssue` written; `CarePlan.status` → `active`.

## 10. The magical moment
> **Maria:** "...it's on both arms and some on my chest. Itchy. Maybe four days?"
>
> **Prologue:** "Thanks — that helps. One thing I want to check, and it may be nothing. Your record shows you started lamotrigine about three weeks ago. Is that right?"
>
> **Maria:** "Yeah, my psychiatrist added it last month."
>
> **Prologue:** "Okay. Rashes in the first couple of months on lamotrigine are something clinicians want to look at quickly — that's in the drug's labeling. I'd rather someone from Dr. Osei's office call you today than wait for Thursday. Is this the best number?"

**What just happened:** the agent used a chart fact the patient never mentioned, correlated it temporally with a symptom she did mention, matched a documented boxed warning, and escalated — **without naming a diagnosis, without alarming her, and without touching the chart.**

## 11. MVP features
- Consent capture with explicit recording disclosure
- Streaming voice conversation with medical keyterm biasing
- Live transcript, patient-correctable
- Chart-conditioned question selection from seeded FHIR history
- Temporal correlation: symptom onset vs. medication start date
- Red-flag rule set → escalation path
- Packet with **structurally separated** statements / inferences / open questions
- Citation chips linking inferences to source
- Clinician review with per-item approve/edit/reject
- FHIR writes gated on approval
- Audit log

## 12. Stretch features
Photo capture with coaching · cost/coverage via X12 · patient timeline visualization · multilingual · phone (PSTN) entry · adherence probing

## 13. Explicit non-goals
- ❌ No diagnosis, differential, or condition name shown to the patient
- ❌ No treatment or medication recommendations
- ❌ No autonomous chart writes
- ❌ No triage-to-ED decisions (escalate to *clinic*, and always say "if you feel worse, call 911")
- ❌ No image classification
- ❌ No claim of HIPAA compliance — synthetic data only, stated plainly

## 14. Key screens
**Patient:** consent → live conversation (waveform, transcript, "correct this" affordance) → confirmation summary → escalation notice → recap.
**Clinician:** queue (escalations pinned) → three-pane review card → approval confirmation → chart diff preview.

## 15. Voice personality
Warm, unhurried, plainly not a doctor. Short turns. **Says why before asking anything sensitive.** Never says "I think you have." Uses "I want to check," "that may be nothing," "worth asking your doctor." Tolerates silence. Never more than two questions in a row without acknowledging an answer.

## 16. Opening
> "Hi Maria — I'm an assistant for Dr. Osei's office. Before I start: I'll record this so it can go in your chart, only Dr. Osei's team will see it, and you can stop or skip anything. Sound okay?"
> *(consent)*
> "Thanks. So — what's going on that brought you in?"

*(Open question. Not "please rate your pain 1–10.")*

## 17. Adaptive branches

**The doorknob question — always asked, always last.** Before closing, the agent asks the question the 18-second interruption prevents: *"Last thing — is there anything else you were hoping to bring up with Dr. Osei? Even if it seems unrelated or small."* Then it waits. Unvoiced concerns are documented as a driver of worse outcomes and more follow-up visits; the pre-visit window is the one moment with no time pressure to elicit them, and it goes at the **top** of the clinician's packet.

| Patient says | Branch |
|---|---|
| "Rash, few days" | Onset → distribution → itch/pain → **med start dates cross-check** |
| Mentions any new drug ≤8 weeks | **Temporal correlation check** against label warnings |
| "Also my mouth hurts" | **Mucosal involvement = red flag** → escalate immediately |
| "I stopped taking X" | Reconciliation branch → why stopped → chart discrepancy |
| Contradiction w/ earlier answer | *"Earlier I heard four days — did it start before that?"* |
| Won't answer | Accept once, note as unanswered, move on |
| Distress / dyspnea / chest pain | **Abort workflow → 911 script** |

## 18. Patient output
Plain language, ~6th grade. What you told us · what we've asked the office to check · your questions for Dr. Osei · what happens next. **No condition names. No probabilities.**

## 19. Clinician output
Three separated sections — verbatim statements (timestamped, playable) · inferences (each with citation + confidence + the rule that fired) · open questions. Plus proposed FHIR resources shown as a **diff preview**, not silently written.

## 20. Timeline visualization
Horizontal time axis. Medications as bars with start dates. Symptoms as points. **The overlap is rendered visually** — Maria's rash point sits inside the lamotrigine bar's first 8 weeks, shaded. One glance conveys the entire clinical argument. This is the single highest-value visual in the product.

## 21. Evidence and uncertainty
Every inference carries: the **rule** that fired, the **source** (FDA label link), a **confidence band**, and **what would change it**. Three visual classes, never mixed: `SAID` (patient's words) · `INFERRED` (model, cited) · `UNKNOWN` (asked, not answered).

## 22. Coverage presentation — **in the MVP, scoped correctly**

*Revised: Stedi is one of only three officially listed hackathon resources (with Medplum and Deepgram). Cutting it entirely was wrong. But the original framing was also wrong.*

**The distinction that makes this safe: verify coverage, don't predict cost.**

| Claim | Can a 271 support it? | Ship it? |
|---|---|---|
| "Your Aetna PPO is active as of today" | **Yes** — that's literally what eligibility means | ✅ |
| "This visit falls under your office-visit benefit" | **Yes** — `insurance.item.benefit` | ✅ |
| "You have $1,840 of your $2,500 deductible remaining" | **Yes** — returned benefit data | ✅ labeled *as of today* |
| "This visit will cost you $340" | **No** — depends on coding, modifiers, secondary payers, adjudication | ❌ **never** |
| "This needs prior authorization" | **No** — this is precisely why HL7 built Da Vinci CRD | ❌ **never** |

Industry cost-estimator accuracy **fell from 78% (2022) to 71% (2025)**, and the best studied performer reached ~84% within $10 or 5%. A confident dollar figure is a number the patient will hold you to, generated from a step that cannot support it.

So Prologue says: *"Your coverage is active and this visit is covered. You've met about $660 of your deductible so far this year, so expect this to apply toward it. Your clinic can give you an exact estimate — I'm not able to promise a final number."*

**That last sentence is a feature.** Saying what you can't know is how you earn the claims you do make.

Sandbox constraint disclosed on screen and out loud: Stedi's test mode clears only pre-registered members. Script the intake to collect the identity that resolves to that patient, and **preempt it before a judge probes the boundary** — a visible failure on "try a different payer" reads worse than a disclosed limit.

## 23. Clinician review UX
Per-item accept/edit/reject. Keyboard-driven. **Rejecting is one key.** Nothing is pre-checked — approval is an action, not a default. Time-to-approve displayed, because the product's promise is speed *with* verification.

---

# PHASE 6 — SAFETY MODEL

Concrete behaviors, each visible in the demo.

| Concern | Product behavior |
|---|---|
| **Consent** | Spoken + on-screen before any capture. Names what's recorded, who sees it, retention, deletion. Recording indicator persistent. Skip-any-question always available. Demoed, not skipped. |
| **Emergency escalation** | Red-flag list (mucosal involvement, blistering, dyspnea, chest pain, altered mental status) checked every turn. On hit: **workflow aborts**, patient told a human will call today, 911 language for deterioration. Never continues the ordinary script. |
| **No diagnosis / prescribing** | Hard constraint: no condition name or drug recommendation in patient-facing output. Enforced by an output filter, not by prompt alone. Violations are logged. |
| **Review before chart** | FHIR resources stay `draft`. **No code path writes `active` outside the approval handler.** This is one line and it is the whole safety story. |
| **Citations** | Every inference carries a resolvable source. Uncited inference cannot be promoted to the packet. |
| **Uncertainty** | Confidence bands + "what would change this." No bare percentages presented as precision. |
| **Unsupported-claim detection** | Second pass checks each generated claim against retrieved evidence and the transcript. Unsupported → flagged for review, not silently dropped. **This must actually run.** |
| **Med/allergy checks** | Every mentioned drug normalized to RxNorm, checked against charted allergies and interactions → `DetectedIssue` (`code=DRG`, severity `high\|moderate\|low`). |
| **Statement vs. inference** | Structurally separate in the data model, not just visually. `SAID` items carry transcript offsets; `INFERRED` items carry rule + source. |
| **Transcript correction** | Visible live; patient can correct; corrections tracked as amendments, originals preserved. |
| **Audit trail** | Every state change: who, what, when, from what. `Provenance` on every approved resource. |
| **Accent / language / disability** | Keyterm biasing for drug names. Confidence-triggered confirmation ("I heard lamotrigine — is that right?"). Full text fallback. Never penalize a patient for being hard to transcribe — **log question-depth by ASR confidence to detect bias**. |
| **Synthetic data** | 100% synthetic, stated on screen and out loud. No real PHI anywhere. |
| **Tool failure** | Retrieval down → agent proceeds *without* chart claims and says so. Evidence lookup down → inference is withheld, not guessed. **Degradation removes claims; it never fabricates them.** ASR failure → text input. |

**What we will not say:** "We're HIPAA compliant." We're a hackathon prototype on synthetic data. Claiming otherwise in front of a healthcare-native judge is a self-inflicted wound.

---

# PHASE 7 — ARCHITECTURE

## Principle: the simplest thing that survives a live demo.

```
Patient browser (Next.js)
  │  mic → WebSocket
  ▼
Voice orchestrator (Node)
  ├─ Deepgram Voice Agent  ── STT (Nova-3 Medical + keyterm prompting), TTS (Aura-2), function calling
  ├─ tool: get_history(topic)      → Moss on-device/edge retrieval over seeded FHIR
  ├─ tool: check_drug_timing(drug) → med start date vs. symptom onset
  ├─ tool: check_label(drug)       → curated label/warning corpus (cited)
  └─ tool: red_flag_check(sx)      → deterministic rule set, NOT an LLM
  │
  ▼
Packet builder → separates SAID / INFERRED / UNKNOWN
  │
  ▼
Verifier pass — each claim vs. transcript + evidence → unsupported flagged
  │
  ▼
Medplum FHIR (all draft)  ──►  Clinician review app (Next.js, same codebase)
                                   │ approve
                                   ▼
                          status → active + Provenance + AuditEvent
```

## Data objects
`ConsentRecord` · `VoiceSession` · `Utterance{text, ts, confidence, speaker}` · `Statement{SAID, transcript_ref}` · `Inference{rule, source_url, confidence, implicated_refs}` · `OpenQuestion` · `RedFlag{rule, severity, fired_at}` · `Packet` · `ReviewAction{actor, item, verdict, ts}`

## FHIR mapping
`Encounter` · `Observation` (symptoms) · `Condition` · `MedicationStatement` · `AllergyIntolerance` · `DetectedIssue` (`code=DRG`) · `Composition` (the packet) · `CarePlan` (`draft`→`active`) · `Provenance` · `AuditEvent`

## What must be real vs. mocked

| Layer | Status | Why |
|---|---|---|
| Streaming STT/TTS | **REAL** | It's the product |
| Chart-conditioned question selection | **REAL — never fake this** | This *is* the innovation |
| Temporal correlation logic | **REAL** | Deterministic and cheap |
| Red-flag rules | **REAL, deterministic** | Safety must not be probabilistic |
| Statement/inference separation | **REAL** | The trust model |
| Verifier pass | **REAL** | Thin here = fake |
| Approval gate + FHIR status | **REAL** | One line, whole story |
| Patient history | **Synthetic, seeded** | Correct and responsible |
| Evidence corpus | **Curated subset, disclosed** | "Live literature search" is not a 24h build |
| Cost/coverage | **Real EDI if time; else omit** | Never fake a payer response |
| Timeline viz | Real rendering, seeded data | — |
| Multilingual, PSTN | Cut | — |

## Stack
Next.js + TypeScript, single app, role-based routes · Deepgram Voice Agent API · Moss (`@inferedge/moss`) for retrieval · Medplum for FHIR + auth · Postgres or Medplum for audit · deploy on Vercel. **Backend hosted, never tunneled** — a laptop tunnel over conference wifi is an unnecessary single point of failure.

---

# PHASE 8 — DEMO (4 minutes)

## Synthetic patient
**Maria Delgado, 34.** Bipolar II. **Divalproex 500mg BID** (2y). **Lamotrigine 25mg daily, started 22 days ago.** NKDA. Appointment Thursday, reason: *"itchy rash arms and chest."* Aetna PPO, $2,500 deductible.

*(Divalproex is deliberate: valproate co-administration is a documented amplifier of lamotrigine rash risk. It makes the inference stronger and it's the detail a clinician judge will notice.)*

| Time | Beat |
|---|---|
| **0:00–0:20** | **Cold open, no preamble.** *"Maria books a routine visit for an itchy rash. Everything you're about to see is synthetic data. Watch what her intake catches."* |
| **0:20–0:40** | Consent screen. Read one line aloud: *"We record this, only your care team sees it, you can skip anything."* — 20 seconds that most teams skip and every healthcare judge notices. |
| **0:40–1:40** | **Live conversation.** Open question, Maria's story. Transcript streams. Chart panel shows retrieval firing. Agent asks about distribution and itch. Then: *"Your record shows you started lamotrigine about three weeks ago — is that right?"* **Nobody scripted that question; it came from her chart.** |
| **1:40–2:10** | **THE MOMENT.** Timeline snaps into view: lamotrigine bar, first-8-weeks window shaded, rash point sitting inside it, divalproex bar underneath. Agent: *"Rashes in the first couple months on lamotrigine are something clinicians want to look at quickly. I'd rather someone call you today than wait for Thursday."* Escalation badge fires. **No diagnosis named.** |
| **2:10–2:40** | **The separation.** Packet opens: three columns — SAID (her words, click to play audio) · INFERRED (rule + FDA label link + confidence) · UNKNOWN. *"We never blur what she said with what we concluded."* |
| **2:40–3:20** | **Clinician review.** Dr. Osei's queue, escalation pinned. She clicks a citation — Maria's actual voice plays. She rejects one weak inference, approves the rest. `CarePlan.status` flips `draft` → `active` **on screen**. *"Nothing reached the chart without her."* |
| **3:20–3:50** | **Before/after.** *Before:* Thursday, 15 minutes, rash treated as contact dermatitis, nobody connects the medication, the boxed-warning window closes. *After:* nurse calls today, psychiatry is looped in, and Dr. Osei walks in already knowing. |
| **3:50–4:00** | **Close.** *"Every intake form asks what it knows to ask. Maria didn't know her rash and her prescription were the same story. Prologue did — because it read her chart first."* |

## Backup plans
- **ASR fails on "lamotrigine":** the transcript is on screen and correctable — *"and this is exactly why the patient can fix the record"* — type it and continue. **Turns the failure into a feature.**
- **Voice dies entirely:** text-input mode, same pipeline, same packet. Say so plainly.
- **Network dies:** pre-recorded run captured that morning, labeled as such out loud. Never implied live.
- **Everything dies:** the timeline visual alone, narrated. The clinical argument survives without the software.

---

# PHASE 9 — EXECUTION

## Riskiest assumption, test first (hour 1)
**Can the voice loop retrieve chart context and inject it into the next question fast enough that the conversation doesn't stall?** Not "does Deepgram work." The whole product is the *chart-conditioned follow-up*; if retrieval adds a felt pause on a voice call, the magic dies. **Build the thinnest possible version of this before anything else.**

## 24-hour plan
| Hours | Work |
|---|---|
| 0–2 | Accounts, seeded FHIR patient, repo, **latency spike on the retrieval-in-conversation loop** |
| 2–6 | Deepgram Voice Agent + function calling; two tools: `get_history`, `check_drug_timing` |
| 6–9 | Live transcript + structured extraction; SAID/INFERRED separation in the data model **from the start** |
| 9–12 | Temporal correlation + red-flag rules (deterministic) + escalation path |
| 12–15 | Packet builder + citation chips + verifier pass |
| 15–18 | Clinician review UI + approval → FHIR status flip + Provenance |
| 18–20 | Timeline visualization |
| 20–22 | Consent screen, fallbacks, cached demo path |
| 22–24 | **Rehearse ×5 including every failure line** |

## 48-hour plan
Add: photo capture w/ coaching · real 270/271 · patient recap view · multi-scenario (a second synthetic patient so a judge can pick) · audit log UI · accessibility pass · **and one full day of rehearsal and hardening, not features.**

## Roles
- **Voice/agent** — Deepgram, tools, conversation design
- **Data/FHIR** — Medplum, retrieval, packet, verifier
- **Frontend** — patient + clinician views, timeline
- **Demo owner** — script, rehearsal, fallbacks. *(On a 2-person team, this is a hat, not a person — but it must be someone's explicit job.)*

## Dependency order
Seeded FHIR → retrieval → voice loop → extraction → correlation → red flags → packet → review → FHIR write → viz → polish

## Demo-critical path
Consent → conversation → chart-conditioned question → escalation → separated packet → clinician approval → status flip. **Everything else is optional.**

## Cut order
1. Photo capture 2. Patient recap view 3. Timeline polish (keep it crude) 4. Multi-turn depth 5. Coverage check → cached 271 with honest caption
**Never cut:** consent, the chart-conditioned question, escalation, statement/inference separation, the approval gate.

---

## Reading the judges

Four of six are working engineers. Calibrate accordingly — **this panel punishes hand-waving and rewards specifics.**

| Judge | Background | What lands |
|---|---|---|
| **Diana Hu** (YC Partner) | Co-founder/CTO **Escher Reality** (AR backend, acquired by Niantic) | Deep systems and **latency** person, not a healthcare generalist. Show real millisecond numbers, not adjectives. She'll also ask the company question — have the beachhead answer, not a blue-ocean claim. |
| **Cody Ebberson** (Medplum CTO) | **13 years in healthcare data** — MedXT (medical imaging, YC W13) → Medplum | Will check FHIR at the field level. `DetectedIssue` with `code=DRG`, `CarePlan.status` draft→active, naming CRD→DTR→PAS correctly. Also the first to spot an irresponsible patient-facing claim. |
| **Ana Yoon Faria de Lima** (Pavoot) | **ML/data systems at Itaú and BTG**, 1st in CS at USP, 20+ olympiad medals, MSc AI at ETH | Not an "events" judge — a serious ML engineer. Expect probing on how retrieval and extraction actually work. Don't hand-wave the pipeline. **Pavoot has no API; do not attempt to integrate it.** |
| **Sri Raghu Malireddi** (Moss) | ML lead at **Grammarly and Microsoft**. Moss = *"lets voice agents and copilots retrieve and respond in under 10 milliseconds"* | **His company's one-line description is our core technical claim.** The latency argument is his thesis — show a measured number on screen. |
| **Victor Wang** (Deepgram) | **Staff SWE, partner platform engineering**, ex-AWS | Knows the Voice Agent API better than we will. Use **function calling** and **keyterm prompting** properly — surface-level STT will read as under-using the platform. |
| **Naomi Carrigan** (Deepgram) | Community lead, developer educator | Cares about creative, non-obvious API use and whether the developer story is clean. |

**Note on resources:** the officially listed hacker resources are **Medplum, Stedi, and Deepgram** — Moss is *not* listed, so it's optional rather than expected. Using it well is differentiation, not table stakes; using all three listed tools well is the baseline for a serious entry.

## Event logistics
- **Medplum Discord → hackathon channel** for live help. Join before Saturday, not during.
- **Submission is a Google Form**, closing **5:00pm**. Fill in everything you can the night before — title, description, repo link, team names — and leave only the demo video/link for the end. Teams lose to the form, not the code.

## Sample data needed
One patient with: 2+ meds **with start dates** (this is the load-bearing field), 1+ chronic condition, allergy list, 2+ prior encounters, coverage. Plus a curated label corpus for the drugs in play.

## Testing checklist
- [ ] Full conversation ×10 — measure ASR accuracy on drug names specifically
- [ ] Retrieval latency measured, not assumed
- [ ] Red flag fires on mucosal involvement, every time
- [ ] No condition name ever reaches patient output (automated check)
- [ ] `active` unreachable except via approval handler (**write a test that tries**)
- [ ] Every inference has a resolving citation
- [ ] Transcript correction persists as amendment
- [ ] Every network call has a cached fallback
- [ ] Works on venue wifi and on a phone hotspot

## Presentation checklist
- [ ] Audio through the venue PA, not laptop speakers
- [ ] Screen legible from the back (font sizes up)
- [ ] Cached path one keystroke away
- [ ] "Synthetic data" said out loud in the first 20 seconds
- [ ] Every honesty caveat rehearsed as a line, not improvised
- [ ] Timer — 4:00 means 4:00

## Four judge questions

**"How is this not Babylon Health?"** — *the one to prepare hardest. [Babylon](https://www.healthcaredive.com/news/Babylon-Chapter-7-bankruptcy/691218/) went public at $3.5B and filed Chapter 7 in Aug 2023 with $100–500M in liabilities, ending care for 2.8M users. Any healthcare-literate judge may raise it.*
> "Babylon failed two ways, and we're built against both. First, it over-claimed diagnostic capability its own accuracy couldn't support — regulators and clinicians found it missing serious conditions. We make **zero diagnostic claims**; we never tell a patient a condition. Our output is a question for a physician, and the physician approves or rejects each item — you watched Dr. Osei reject one. Second, Babylon was structurally dependent on a single payer contract; when Centene didn't renew, roughly half its revenue vanished. We sell into the clinic's existing intake workflow, not a payer's risk pool. The lesson from Babylon isn't 'AI doesn't work in healthcare' — it's 'don't claim more than you can evidence.' That constraint is our design."

**"How is this not a symptom checker?"**
> "Symptom checkers map symptoms to conditions and tell the patient — and the published ceiling on that is 19 to 38% primary-diagnosis accuracy, with one cohort missing over 40% of emergencies. We don't do that, because it doesn't work well enough to do safely. We map what the patient *said* against what's in their *chart* and tell the *clinic*. Ada doesn't know Maria's on lamotrigine — that's the entire inference. Different input, different output, different recipient, different risk class."

**"What if it's wrong?"**
> "It's designed to be wrong safely. Three things: nothing reaches the chart without a clinician approving each item — you watched Dr. Osei reject one. Every inference carries its rule and its source, so verifying is faster than redoing. And we never tell the patient a diagnosis — the worst case for a false positive is a nurse makes an unnecessary phone call. That's a cost we're comfortable with; the reverse isn't."

**"Won't Abridge just build this?"**
> "Abridge is in the room with the doctor — that's a genuinely different product. They document what's said; we change what's known before anyone speaks. Could they extend backward into pre-visit? Sure. But their GTM is enterprise health systems, and the pre-visit window belongs to intake vendors like Phreesia, who ship forms and have no clinical reasoning layer. That gap is where we'd start. We're not claiming nobody else could do this — we're claiming nobody has, and we can tell you exactly why the form vendors can't."

---

# PHASE 10 — FINAL PITCH

**Prologue** — *The visit starts before the visit.*

**One line:** A voice intake that has already read your chart, so it catches what you didn't know to mention.

**Why now:** Streaming voice agents only got fast enough for real conversation in the last 18 months. FHIR-native platforms like Medplum make longitudinal context queryable in milliseconds. And the FDA's January 2026 CDS guidance drew a workable line — transparent, clinician-reviewable decision support that doesn't replace judgment sits outside device regulation. All three are recent.

**Why voice:** Because the answer to question one determines question two. Forms can't do that. And because Maria mentioned her rash started "maybe four days ago" in a sentence that also contained the word "last month" about a prescription — and connecting those is what the product does.

**Why different:** Intake vendors have the pre-visit window but no clinical reasoning. Symptom checkers have reasoning but no chart. Scribes have the chart but arrive after the patient is already in the room. **Prologue is the only one holding all three at once.**

**Who benefits:** Patients get a visit that starts informed. Clinicians get a verifiable packet in under a minute. Clinics catch time-sensitive problems before they become emergencies.

**Built at the hackathon:** A working voice intake with real streaming STT/TTS; retrieval over a synthetic FHIR chart driving genuinely adaptive questions; deterministic red-flag escalation; a packet that structurally separates what the patient said from what the system inferred, every inference cited; and a clinician review gate where FHIR status cannot reach `active` without a signature.

**Safety story:** Consent on screen and out loud. No diagnosis to the patient, ever. Deterministic safety rules, not probabilistic ones. Every inference cited. Nothing in the chart without a human. Synthetic data throughout, stated plainly.

**Measurable impact:** Time-to-approval per packet · red flags surfaced pre-visit that would otherwise have waited · medication discrepancies caught per 100 intakes · minutes of history-taking returned to the visit · question-depth parity across ASR-confidence bands, because an agent that asks fewer questions of harder-to-understand patients is a bias we intend to measure rather than assume away.

**Closing (30s):**
> "Maria booked a routine appointment for an itchy rash. She had no idea it might be connected to a prescription a different doctor gave her last month — because nothing in her care connects those two facts. Not the scheduler. Not the intake form. Not her memory. Prologue read her chart before it asked its first question, noticed the timing, checked the label, and got her a phone call today instead of an appointment Thursday. It didn't diagnose her. It didn't prescribe anything. It didn't touch her chart until her doctor said so. It just made sure the right person knew the right thing at the right time. **That's the whole product.**"

---

## What I moved to the roadmap

The brief asked for more than should be built in a hackathon. Cut deliberately:

- **"n=1 treatment customized just for you"** — a patient-facing individualized treatment recommendation, pre-clinician, is the riskiest element in the brief and plausibly falls outside the FDA's non-device carve-out. Prologue produces *questions for the physician*, not treatment.
- **"Deep research"** — a real literature-search agent is a project of its own. We use a curated, cited corpus and disclose it.
- **Cost and coverage** — kept as a stretch. A 271 cannot honestly answer "will this be covered," and a sandbox that fails on a judge's second patient reads worse than not having it.
- **Peer review by outside experts** — we implement clinician review, which is the safety-relevant version. A marketplace of reviewing specialists is a company, not a weekend.
