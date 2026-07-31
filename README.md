# Prologue

**The visit starts before the visit.**

A voice intake that has already read your chart, so it catches what you didn't know to mention.

> Built for the **YC × Medplum Agentic Healthcare Hackathon** — Aug 1, 2026, Y Combinator SF.
> Stack: **Medplum** (FHIR) · **Deepgram** (Voice Agent) · **Stedi** (X12 eligibility).

---

## The problem, in three numbers

| | |
|---|---|
| **18 seconds** | How long before a physician interrupts a patient's opening statement. Only **23%** ever finish it. ([Beckman & Frankel](https://pmc.ncbi.nlm.nih.gov/articles/PMC1783704/)) |
| **67% / 91%** | Up to two-thirds of patients have an error in their medication history — and **91% of discrepancies are omissions**, traceable to how the history was taken. ([PMC2518028](https://pmc.ncbi.nlm.nih.gov/articles/PMC2518028/)) |
| **2:1** | Hours of EHR and desk work per hour of patient face time, inside a ~18-minute visit. ([Sinsky, *Annals*](https://www.acpjournals.org/doi/10.7326/M16-0961)) |

The pre-visit window is the only moment in the encounter with unlimited time and zero clinical attention. Today it's spent on a form that cannot ask a second question.

---

## What it does

A patient talks to a voice agent for five minutes before their appointment. Unlike every intake form, **the agent has already loaded their FHIR record** — so it asks questions a form structurally cannot, and occasionally finds something that shouldn't wait.

Everything it produces is a **draft**. A clinician reviews it item by item — seeing what the patient said, what the chart held, and what the model inferred, kept structurally separate — and approves or rejects each piece. Only then does anything become part of the record.

### The moment

**Maria Delgado, 34.** Bipolar II. On divalproex two years. Started **lamotrigine 22 days ago**. Books primary care for "an itchy rash."

> **Maria:** "…both arms and some on my chest. Itchy. Maybe four days?"
>
> **Prologue:** "That helps. One thing I want to check — and it may be nothing. Your record shows you started lamotrigine about three weeks ago. Is that right?"
>
> **Maria:** "Yeah, my psychiatrist added it last month."
>
> **Prologue:** "Okay. A rash in the first couple of months on lamotrigine is something clinicians want to look at quickly — that's in the drug's own labeling. I'd rather someone from Dr. Osei's office call you today than wait for Thursday."

Lamotrigine carries an [FDA boxed warning](https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/022115s031s032lbl.pdf) for life-threatening rash. Serious rash "almost always occurred within **2–8 weeks**" of initiation, and risk is **increased by concomitant valproate** — which is why she's on divalproex. She's 22 days in.

She had no idea those two facts were related. Different doctor, different problem, different month.

**The agent never names a diagnosis.** It routes urgency to the clinic. That's the entire safety model in one exchange.

---

## Why it's defensible

| Category | Has the pre-visit window? | Has the chart? | Can ask a follow-up? |
|---|---|---|---|
| **Intake forms** — Phreesia (~170M visits/yr), Luma, Notable, Klara | ✅ | ❌ | ❌ |
| **Symptom checkers** — Ada, K Health, Buoy, Infermedica | ✅ | ❌ | ✅ |
| **Ambient scribes** — Abridge, Ambience, Suki, Nabla | ❌ *(arrive in-room)* | ✅ | n/a |
| **Voice agents** — Assort ($222M), Hyro ($95M), Hello Patient | ✅ | ❌ | scheduling only |
| **Prologue** | ✅ | ✅ | ✅ |

The gap is **structural, not an oversight**. Funding flooded into "answer the phone" precisely because clinical liability and a published accuracy ceiling (19–38% primary-diagnosis accuracy for symptom checkers) keep funded players in the logistics lane.

**The way through isn't better diagnosis — it's refusing to diagnose at all.**

---

## Architecture

```
Patient mobile web ──► Deepgram Voice Agent (WebSocket)
                            │ function calls
                            ▼
                       Orchestrator
                            ▼
                   Medplum (FHIR truth) ──► Stedi (X12 270/271)
                            ▼
                 Clinician desktop review ──► approve ⇒ preliminary → final
```

**Latency budget** — the number that matters is chart retrieval at **<100ms**. On a voice call, a 700ms pause before the agent responds is *felt* in a way an on-screen spinner never is. The whole product is the chart-conditioned follow-up; if retrieval stalls, the magic dies.

Reads that change what the agent says next run **synchronously**. Every FHIR write happens **after** the spoken response. The patient never waits on a write.

---

## Safety model

- **No diagnosis or condition name reaches the patient. Ever.**
- **Red-flag checks are deterministic code, not a model** — a rule list a judge can read — and they **fail closed**.
- **`Composition.status` may only reach `final` from the approval handler.** There is a test that tries to violate it and must fail.
- The agent never creates a `Condition`. It produces `Observation` and `DetectedIssue`; only an approving clinician asserts a condition.
- Patient speech is **data, never instructions**. The blast radius of a successful prompt injection is a bad draft, which a clinician rejects.
- **Benefits ≠ price.** A 271 can say "your coverage is active and you've met $660 of your deductible." It cannot say "this will cost $340," and we don't.
- Synthetic data only, stated out loud in the first 20 seconds. **We do not claim HIPAA compliance.**

This follows Medplum's own documented ["can suggest, but not act"](https://www.medplum.com/docs/ai) pattern — we built to the platform's architecture rather than inventing our own.

---

## Documentation

| Doc | What's in it |
|---|---|
| **[docs/00-DECISION-LOG.md](docs/00-DECISION-LOG.md)** | **How we got here** — every idea generated and killed, every reversal, and why. The most useful document in this repo. |
| [docs/01-PRODUCT-DESIGN.md](docs/01-PRODUCT-DESIGN.md) | The full design: concepts, scoring, conversation branches, FHIR mapping, architecture, demo script, 48-hour plan |
| [docs/research/sponsors.md](docs/research/sponsors.md) | Verified sponsor API capabilities and constraints |
| [docs/research/market.md](docs/research/market.md) | Competitive landscape and clinical evidence, with sources |
| [docs/research/fhir-modeling.md](docs/research/fhir-modeling.md) | FHIR R4 and Da Vinci findings |
| [docs/research/safety-regulatory.md](docs/research/safety-regulatory.md) | FDA CDS guidance, consent law, liability |
| [docs/archive/](docs/archive/) | Superseded designs, kept for the reasoning trail |

---

## Status

Design complete and grounded. Not yet implemented.

**Two things to establish before writing feature code** — both are discoveries that can invalidate a day of work if found late:

1. **Measure whether a chart read returns inside the turn budget.** If retrieval is 700ms, the core premise needs rework.
2. **Find Stedi's accepted mock subscriber identity and build the synthetic patient to match it.** Test mode does not support custom mock data or payer selection.
