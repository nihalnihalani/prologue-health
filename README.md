<div align="center">

# Prologue

### The visit starts before the visit.

**A voice intake that has already read your chart, so it catches what you didn't know to mention.**

Built for the **YC × Medplum Agentic Healthcare Hackathon** — Aug 1, 2026, Y Combinator SF

`Medplum` (FHIR) · `Deepgram` (English voice) · `Gemini Live` (10 languages) · `Stedi` (X12 eligibility)

</div>

---

## Contents

[The problem](#the-problem) · [What it does](#what-it-does) · [The moment](#the-moment) · [Why it's defensible](#why-its-defensible) · [How the conversation works](#how-the-conversation-works) · [Functions](#the-nine-functions) · [Architecture](#architecture) · [Latency](#latency-budget) · [FHIR model](#fhir-data-model) · [Insurance](#the-insurance-piece) · [Outputs](#what-each-side-sees) · [Safety](#safety-model) · [Non-goals](#what-were-deliberately-not-building) · [Demo](#the-demo) · [Build plan](#build-plan) · [Docs](#documentation)

---

## The problem

| | |
|---|---|
| **18 seconds** | How long before a physician interrupts a patient's opening statement. Only **23%** ever finish it, and interrupted concerns are almost never revisited. ([Beckman & Frankel](https://pmc.ncbi.nlm.nih.gov/articles/PMC1783704/)) |
| **67% / 91%** | Up to two-thirds of patients have an error in their medication history — and **91% of discrepancies are omissions**, traceable to *how the history was taken*, not downstream logic. ([PMC2518028](https://pmc.ncbi.nlm.nih.gov/articles/PMC2518028/)) |
| **2:1** | Hours of EHR and desk work per hour of patient face time, inside a **~18 minute** average visit. ([Sinsky, *Annals*](https://www.acpjournals.org/doi/10.7326/M16-0961)) |
| **~49%** | How much of a visit patients recall — **38%** without a high-school diploma vs **65%** with a college degree. Only **12% of US adults** have proficient health literacy. |

**The pre-visit window is the only moment in the entire encounter with unlimited time and zero clinical attention.** Today it's spent on a form that cannot ask a second question.

---

## What it does

A patient talks to a voice agent for about five minutes before their appointment. Unlike every intake form in existence, **the agent has already loaded their FHIR record.**

So it asks questions a form structurally cannot — and occasionally it finds something that shouldn't wait until Thursday.

Everything it produces is a **draft**. A clinician reviews it item by item, seeing what the patient said, what the chart held, and what the model inferred kept structurally separate, and approves or rejects each piece. Only then does anything become part of the record.

```
book appointment → consent → chart-aware voice interview → live FHIR charting
    → connection + red-flag detection → escalation + eligibility check
    → packet with separated provenance → clinician review → approved becomes final
```

---

## The moment

**Maria Delgado, 34.** Bipolar II, managed by psychiatry. On divalproex for two years. Started **lamotrigine 22 days ago**. Books primary care for *"an itchy rash on my arms and chest."*

> **Maria:** "…both arms and some on my chest. Itchy. Maybe four days?"
>
> **Prologue:** "That helps. One thing I want to check — and it may be nothing. Your record shows you started lamotrigine about three weeks ago. Is that right?"
>
> **Maria:** "Yeah, my psychiatrist added it last month."
>
> **Prologue:** "Okay. A rash in the first couple of months on lamotrigine is something clinicians want to look at quickly — that's in the drug's own labeling. I'd rather someone from Dr. Osei's office call you today than wait for Thursday."

Then she interrupts mid-sentence — *"oh, my mouth's been sore too."* **Mucosal involvement is a red flag.** The agent stops talking, abandons the script, and escalates.

### Why this scenario

Lamotrigine carries an **[FDA boxed warning](https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/022115s031s032lbl.pdf)** for life-threatening rash (SJS/TEN). Serious rash *"almost always occurred within **2–8 weeks**"* of initiation. Risk is **increased by concomitant valproate** — which is why she's on divalproex. She is 22 days in. The clinical rule is to stop the drug at any significant eruption in the first two months.

Maria had no idea those two facts were related. Different doctor, different problem, different month. **Nothing in her care connects them** — not the scheduler, not the intake form, not her memory.

**The agent never names a diagnosis.** It routes urgency to the clinic, not alarm to the patient. That's the entire safety model demonstrated in a single exchange.

---

## Why it's defensible

| Category | Pre-visit window? | The chart? | Can ask a follow-up? |
|---|:---:|:---:|:---:|
| **Intake forms** — Phreesia (~170M visits/yr, *1 in 7 US visits*), Luma, Notable, Klara | ✅ | ❌ | ❌ |
| **Symptom checkers** — Ada, K Health, Buoy, Infermedica | ✅ | ❌ | ✅ |
| **Ambient scribes** — Abridge (~30% share), Ambience, Suki, Nabla | ❌ *arrive in-room* | ✅ | n/a |
| **Voice agents** — Assort ($222M), Hyro ($95M), Hello Patient | ✅ | ❌ | *scheduling only* |
| **Prologue** | ✅ | ✅ | ✅ |

A form is a fixed graph — it cannot ask question *n+1* based on answer *n*. Symptom checkers reason but are chart-blind, and carry a published ceiling of **19–37.9% primary-diagnosis accuracy**, with one cohort missing **>40% of emergencies**. Ambient scribes have the chart but arrive *after* the patient is already in the room; they observe, they don't prepare.

**The gap is structural, not an oversight.** Funding flooded into "answer the phone" precisely because clinical liability and that accuracy ceiling keep funded players in the logistics lane.

> **The way through isn't better diagnosis — it's refusing to diagnose at all.**

A tool that *surfaces information for a clinician to review* sidesteps the liability wall that keeps everyone else administrative. Refusing capability is what makes the position available.

---

## How the conversation works

Deepgram's Voice Agent API runs the full speech pipeline over one WebSocket.

| Setting | Value | Why |
|---|---|---|
| `agent.listen.provider.model` | `nova-3` | Medical vocabulary. **Chosen over Flux** — Flux optimizes turn-taking latency, but this demo dies if "lamotrigine" transcribes wrong |
| `agent.listen.provider.keyterms` | Drug list preloaded | First-class field; this is what makes drug names land |
| `agent.listen.provider.eot_threshold` | Tuned | Our lever for turn-taking feel, since we traded away Flux's |
| `agent.think.functions` | 9 functions | The agent calls into the app mid-conversation |
| `agent.speak.provider.model` | `aura-2-thalia-en` | ~90ms TTS |

### Conversational principles

Short turns. Acknowledge before asking. **Say *why* before anything sensitive.** Never "I think you have." Tolerate silence. Confirm rather than assume. **Barge-in always wins** — if the patient speaks, the agent stops.

### The branches

| Branch | Behavior |
|---|---|
| **Consent** | Spoken + on screen. Blocks all capture until affirmative. Writes a `Consent` resource |
| **Open purpose** | *"So — what's going on that brought you in?"* Not a 1–10 scale. **Let her finish the opening statement** |
| **Chart retrieval** | Fires silently on the first clinical noun |
| **History-influenced question** | *"Your record shows you started lamotrigine about three weeks ago."* **This question does not exist without the chart. It is the product.** |
| **Ambiguity** | *"Take your best guess — closer to two days or closer to a week?"* |
| **Contradiction** | *"Earlier I heard four days, and just now it sounded like last weekend. Which is closer?"* |
| **Barge-in** | Agent stops mid-word. *"Thank you for telling me that. That's important."* |
| **Correction** | *"Lamotrigine — I've got it. Does that sound right?"* |
| **Red-flag check** | Deterministic rule list, every turn. Blistering, mucosal involvement, fever, dyspnea |
| **Escalation** | Call today, don't take another dose, 911 if worse. **No diagnosis named** |
| **Spoken summary** | Read back; patient confirms or corrects; corrections stored as amendments |
| **Eligibility** | *"Since we're moving this up, let me check your coverage so it isn't a surprise…"* |
| **Doorknob question** | *"Anything else you were hoping to bring up? Even if it seems small."* Then **wait.** Goes at the **top** of the clinician's packet |
| **Handoff** | *"Nothing goes in your chart until Dr. Osei reviews it."* |

---

## The nine functions

| Function | When | Returns | R/W | On failure |
|---|---|---|:---:|---|
| `get_patient_context` | First clinical noun | Conditions, allergies, recent encounters | **R** | Continue **without chart claims**, and say so |
| `get_relevant_medications` | Any drug mention | Name, dose, **start date**, status | **R** | Same — never guess a med |
| `get_known_allergies` | Before drug discussion | Coded allergy list | **R** | Assume unknown; ask directly |
| `save_confirmed_patient_statement` | After patient confirms | ack | **W** draft | Queue locally, retry; never lose transcript |
| `flag_unresolved_contradiction` | Two incompatible statements | ack | **W** draft | Degrade to an open question |
| `check_red_flags` | **Every turn — deterministic** | `{escalate, rule}` | **R** | ⚠️ **Fail closed → escalate** |
| `run_eligibility_check` | After escalation or on request | Active?, copay, deductible | **W** | *"I couldn't reach your insurer — the office will check"* |
| `generate_visit_summary` | Before close | Summary to speak | **W** draft | Read back from local state |
| `create_clinician_review_task` | Session end | ack | **W** | Retry; alert on failure |

**Two rules govern all of them:**
- Every read is fast and non-blocking. Every write is draft-only.
- **No function can produce a final clinical record.** Enforced in the API layer, not the prompt.

`check_red_flags` is **deterministic code, not a model** — a rule list a judge can read — and it **fails closed**. Safety logic must never be probabilistic.

---

## Architecture

```
┌─ Patient mobile web (Next.js) ──────────────┐
│  consent → mic → Deepgram Voice Agent (WS)  │
│  live transcript · correction UI            │
└───────────────┬─────────────────────────────┘
                │ FunctionCallRequest / FunctionCallResponse
                ▼
┌─ Orchestrator (route handlers) ─────────────┐
│  /context /meds /allergies   (fast reads)   │
│  /statement /contradiction   (draft writes) │
│  /redflags   ← DETERMINISTIC, not an LLM    │
│  /eligibility ← server-side function        │
└───────────────┬─────────────────────────────┘
                ▼
┌─ Medplum (FHIR source of truth) ────────────┐
│  CoverageEligibilityRequest ──► Stedi ──►   │
│         CoverageEligibilityResponse         │
└───────────────┬─────────────────────────────┘
                ▼
┌─ Clinician desktop review (same app) ───────┐
│  queue → 3-pane packet → per-item approve   │
│  approve ⇒ preliminary → final + Provenance │
└─────────────────────────────────────────────┘
```

**Design decisions and their reasons:**
- **Client-side functions for reads** — removes a network hop from the turn budget. Server-side would add Deepgram→us→Medplum→us→Deepgram.
- **Server-side function for eligibility** — it's a slow write with a credential and doesn't belong in the turn loop.
- **One agent, not many.** Multiple agents are justified only where independent verification produces *visible* value. We have exactly one such place — the claim-verification pass — and it runs **after** the conversation.

---

## Latency budget

| Stage | Target |
|---|---|
| STT partial → final | ~300ms |
| **Chart retrieval** | **<100ms — hard budget** |
| Agent response generation | 400–800ms |
| TTS first byte | ~100–200ms |
| **Perceived turn** | **<1.2s** |
| Eligibility (270/271) | 1–3s — **deliberately outside the turn loop** |

On a voice call, a 700ms pause before the agent responds is *felt* in a way an on-screen spinner never is. **The entire product is the chart-conditioned follow-up** — if retrieval stalls, the magic dies.

**Synchronous** (changes what the agent says next): context retrieval, medication lookup, red-flag check, contradiction detection.
**Asynchronous** (after the spoken response): all FHIR writes, packet assembly, Task creation, AuditEvent. **The patient never waits on a write.**

---

## FHIR data model

| Event | Resource | State | Approval |
|---|---|---|:---:|
| Recording consent | `Consent` | active | — |
| Interview answers | `QuestionnaireResponse` | in-progress → completed | on promotion |
| Confirmed symptom | `Observation` | **preliminary** | ✅ → `final` |
| Suspected condition | `Condition` | — | ✅ **clinician only** |
| Patient-reported meds | `MedicationStatement` | draft | ✅ |
| Prescribed meds | `MedicationRequest` | active *(read-only to us)* | — |
| **Drug-safety signal** | **`DetectedIssue`** — `code = DRG`, `severity ∈ {high, moderate, low}`, `implicated` → the MedicationStatement | **preliminary** | ✅ |
| Pre-visit brief | `Composition` | **preliminary** | ✅ → `final` |
| Eligibility | `CoverageEligibilityRequest` → `Response` | active | — |
| Review assignment | `Task` | requested → completed | — |
| Attestation / audit | `Provenance`, `AuditEvent` | immutable | — |

### Three rules

**1. `Composition.status` may only reach `final` from the approval handler.** No other code path writes it. There is a test that tries to violate this and must fail. *That single constraint is the safety story.*

**2. The agent never creates a `Condition`.** Asserting a condition is a clinical act. The agent produces `Observation` (what was observed) and `DetectedIssue` (what warrants attention). Only an approving clinician creates `Condition`.

**3. `MedicationStatement` ≠ `MedicationRequest`.** What the patient says they take vs. what was prescribed. **The gap between them is where 91% of harmful discrepancies live.** Modeling them separately makes reconciliation visible rather than destructive.

> **FHIR validity is not clinical correctness.** A schema-valid `Observation` can be completely wrong. Validation buys interoperability, not truth. The clinician gate is what buys safety.

---

## The insurance piece

Medplum shipped a **[Stedi integration dated July 27, 2026](https://www.medplum.com/docs/integration/stedi)** — four days before the event — mapping 270/271 to `CoverageEligibilityRequest`/`Response`. We use their documented path, so the FHIR is correct by construction.

⚠️ **Verified constraint: Stedi test mode does not support 278 prior authorization** or 276/277 claim status. Only 270/271, 837, 835, 277CA. Mock payers are limited to Aetna, Cigna, UnitedHealthcare, CMS — and **custom mock data is not supported**, so the synthetic patient must be built around Stedi's fixture, not the reverse.

That constraint forces the honest framing anyway:

| Claim | Can a 271 support it? |
|---|:---:|
| "Your Aetna plan is active" | ✅ |
| "This visit is covered under your office-visit benefit" | ✅ |
| "You've met $660 of your deductible" | ✅ |
| **"This will cost you $340"** | ❌ **never** |
| **"This requires prior authorization"** | ❌ **never** |

So the agent says: *"Your coverage is active and this visit is covered. You've met about $660 of your deductible. The office can give you an exact estimate — **I'm not able to promise a final number.**"*

Industry cost-estimator accuracy **fell from 78% (2022) to 71% (2025)**. A confident dollar figure is a falsifiable number the patient will hold you to, from a step that cannot support it.

**And it's causally motivated, not bolted on** — the agent checks coverage *because* it just moved the appointment up. One narrative, not two features.

---

## What each side sees

Every material statement carries a source label:

`● PATIENT` said it · `● RECORD` from the chart · `● EVIDENCE` external source · `● INSURANCE` payer data · `◐ INFERRED` model-generated · `✓ CLINICIAN` confirmed

Three visual classes, **never blended**. `INFERRED` items always carry a rule and a source; **an uncited inference cannot be promoted into the packet.**

### Patient view
"Here's what I heard" · editable symptom timeline · relevant history used and why · **still unanswered** · plain-language explanation (~6th grade) · coverage as *benefits*, not price · limitations stated in the UI, not buried.
**No condition names. No probabilities. No advice.**

### Clinician view — three panes
1. **PATIENT SAID** — verbatim, timestamped, **click to play the actual audio**
2. **PROLOGUE INFERRED** — each with rule, source link, confidence, implicated resources
3. **UNRESOLVED** — contradictions, open questions, **the doorknob answer at the top**

Plus a **FHIR diff preview** — proposed resources shown before writing, never silently applied. **Nothing is pre-checked.** Approval is an action, not a default.

---

## Safety model

| Safeguard | Visible behavior |
|---|---|
| **Consent** | Spoken + on-screen before capture; persistent recording indicator; skip anything; `Consent` resource |
| **No diagnosis** | No condition name reaches the patient, ever. Enforced by an output filter, not prompt text |
| **Deterministic escalation** | Rule list checked every turn. **Fails closed.** Routed to the clinic + 911 language for deterioration |
| **Draft vs final** | `preliminary` until sign-off. **No code path writes `final` outside the approval handler** — with a test that tries |
| **Role-based permissions** | The agent's Medplum identity has an AccessPolicy that **cannot write final states.** Server-side, not prompt-side |
| **Provenance** | Six-way source labeling; uncited inference cannot enter the packet |
| **Correction** | Live transcript editable; corrections stored as amendments, originals preserved |
| **Audit** | `AuditEvent` on every read, write, and state change |
| **Prompt injection** | Patient speech is **data, never instructions** — delimited, schema-validated arguments, and no function can escalate privilege regardless of what the agent asks. **Blast radius is a bad draft, which a clinician rejects** |
| **No invented codes** | Codes from a **fixed allow-list**, never model generation. **Benefit values read from the 271 only** — never paraphrased |
| **Failure behavior** | Retrieval down → proceed without chart claims and say so. Evidence down → withhold the inference. **Degradation removes claims; it never fabricates them** |
| **Bias** | Keyterm biasing, confidence-triggered confirmation, text fallback — and **log question-depth by ASR-confidence band** to detect an agent asking less of harder-to-understand patients |

This follows Medplum's own documented **["can suggest, but not act"](https://www.medplum.com/docs/ai)** pattern with AuditEvent logging and role-scoped agent permissions. **We built to the platform's architecture rather than inventing our own.**

**What we will not say:** *"we're HIPAA compliant."* This is a prototype on synthetic data — stated out loud in the first 20 seconds. Claiming otherwise in front of a healthcare-native judge signals either not understanding the standard or willingness to overclaim.

---

## What we're deliberately not building

- ❌ No diagnosis or condition name shown to the patient — **ever**
- ❌ No treatment or medication advice — never *"stop taking that"*
- ❌ No autonomous chart writes
- ❌ No ED-vs-not triage decisions (escalate to the *clinic*)
- ❌ No image classification — that's the line between documentation aid and regulated device
- ❌ No HIPAA compliance claim

**Moved to roadmap from the original brief:** *"n=1 treatment customized just for you."* A patient-facing individualized treatment recommendation, produced before any clinician is involved, plausibly falls outside the FDA's Non-Device CDS carve-out — which requires the intended *clinician* user to independently evaluate the basis. **Prologue produces questions for the physician instead.**

---

## The demo

4 minutes, one continuous patient story.

| Time | Beat |
|---|---|
| **0:00–0:15** | **Cold open.** *"Maria books a routine visit for an itchy rash. All synthetic data. Watch what her intake catches."* |
| **0:15–0:35** | **Consent, out loud.** *"Twenty seconds most demos skip."* |
| **0:35–1:25** | **Conversation.** She tells her story uninterrupted. Function panel shows retrieval firing with **a live latency readout**. Then the lamotrigine question. *"Nobody wrote that question — it came from her chart."* |
| **1:25–1:45** | **Barge-in.** She cuts the agent off. Mucosal involvement. Red flag fires |
| **1:45–2:10** | **The moment.** Timeline snaps up — lamotrigine bar, weeks 2–8 shaded, rash point *inside* the window, divalproex underneath. Escalation. **No diagnosis named** |
| **2:10–2:30** | **Reconciliation catch** — chart lists furosemide active, Maria stopped it months ago. `MedicationRequest` vs `MedicationStatement`, flagged not changed. Then **eligibility**: real 270/271, raw response flashed, sandbox limit preempted before anyone probes it |
| **2:30–2:50** | **Confirm-back** + the **doorknob question**, and she raises something new |
| **2:50–3:35** | **Clinician review.** Click a citation — **Maria's actual voice plays.** One inference rejected, rest approved. `preliminary → final` on screen |
| **3:35–4:00** | **Before/after + close** |

### The runtime-intelligence moment

**Hand the mic to a judge and let them change one fact** — a different drug, a different onset. Retrieval fires live, the question changes, the timeline redraws.

> If we only ever demo Maria, we've demoed a recording.

### Backups

| Failure | Response |
|---|---|
| ASR mangles "lamotrigine" | Transcript is on screen and correctable — *"and this is exactly why the patient can fix the record."* **Failure becomes the feature** |
| Voice socket dies | Text input, identical pipeline. Say so plainly |
| Stedi errors | Payer **"Stedi Agent"** returns a documented AAA error 73 — **demo graceful degradation on purpose** |
| Network dies | Recording captured that morning, labeled as such out loud. Never implied live |
| Total failure | The timeline visual, narrated. **The clinical argument survives without the software** |

---

## Build plan

**Riskiest assumption — test first, before any feature code:**
1. **Does a chart read return inside the turn budget?** If retrieval is 700ms, the core premise needs rework.
2. **What subscriber identity does Stedi's mock fixture accept?** The synthetic patient must be built to match it.

| Hours | Work |
|---|---|
| **0–4** | Accounts · seed Maria **with medication start dates** · rebuild her around Stedi's fixture · one real 270/271 · Deepgram browser voice with one function round-tripping · **measure retrieval latency and write the number down** |
| **4–12** | Minimal end-to-end thread: consent → conversation → one function → one `Observation` in Medplum → visible in a clinician view. Ugly is fine. **Complete by hour 12 or scope gets cut** |
| **12–24** | Full function set · keyterms · `eot_threshold` tuned · temporal correlation · red-flag rules · **SAID/INFERRED separation in the data model from the start, not retrofitted** |
| **24–36** | Clinician queue · three-pane packet · audio playback by timestamp · approve/reject · `preliminary→final` + Provenance · timeline |
| **36–44** | Cached fallback for every network call · text-input mode · the Stedi error path as a *deliberate* demo · **test that `final` is unreachable** · run on a phone hotspot |
| **44–48** | Five full rehearsals including every failure line · **submit the form early** |

**Cut order:** photo capture → patient recap → timeline polish → multi-turn depth → eligibility to cached response.
**Never cut:** consent · the chart-conditioned question · escalation · SAID/INFERRED separation · the approval gate.

**Must never be faked:** the chart-conditioned question. **It is the innovation.** If that's scripted, there is no product.

---

## Documentation

| Doc | Contents |
|---|---|
| **[docs/CONCEPT-BRIEF.md](docs/CONCEPT-BRIEF.md)** | **The one-pager** — pitch, personas, magical moment, MVP, non-goals, demo outline, risk |
| **[docs/00-DECISION-LOG.md](docs/00-DECISION-LOG.md)** | **How we got here** — every idea generated and killed, every reversal, and why. The most useful document here |
| [docs/01-PRODUCT-DESIGN.md](docs/01-PRODUCT-DESIGN.md) | Full design: 7 concepts, scoring, conversation branches, FHIR mapping, sequence diagram, demo script, 48-hour plan |
| [docs/research/sponsors.md](docs/research/sponsors.md) | Verified sponsor API capabilities and constraints |
| [docs/research/market.md](docs/research/market.md) | Competitive landscape and clinical evidence, sourced |
| [docs/research/fhir-modeling.md](docs/research/fhir-modeling.md) | FHIR R4 and Da Vinci findings |
| [docs/research/safety-regulatory.md](docs/research/safety-regulatory.md) | FDA CDS guidance, consent law, bias, prompt injection |
| [docs/archive/](docs/archive/) | Three superseded designs, kept for the reasoning trail |

---

## Running it

```bash
npm install && npm run dev     # http://localhost:3000
```

**No credentials required** — with no keys the app runs on a deterministic
synthetic fixture and labels every screen `FIXTURE` rather than implying a live
backend. See **[RUNNING.md](RUNNING.md)** for the demo script and fallbacks.

| Route | |
|---|---|
| `/patient` | Mobile-first voice check-in |
| `/clinician` | Desktop review and the approval gate |
| `/prove` | **Hand this to a judge** — change a fact, watch the question change |

```bash
npm test        # 25 tests — clinical rules, engine, safety invariants
npm run build   # production build
```

## Status

**Built and verified. Golden path works end to end.**

The design was produced adversarially — an ideator generating candidates, a researcher verifying every factual claim against primary sources, and a devil's advocate whose only job was to kill ideas. **It was right three times against the lead's position.** Six reversals are recorded in the decision log, including *"skip the 271 and fire a 278"* — which turned out to be impossible, because Stedi test mode doesn't support 278 at all.

The conclusion is worth less than the reasoning. That's why the killed ideas are still in the repo.
