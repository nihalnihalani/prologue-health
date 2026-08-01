# Prologue — Concept Brief

**The visit starts before the visit.**

*The one-page version. Full design in [01-PRODUCT-DESIGN.md](01-PRODUCT-DESIGN.md); how we got here in [00-DECISION-LOG.md](00-DECISION-LOG.md).*

---

## Pitch

**One sentence:** A voice intake that has already read your chart, so it catches what you didn't know to mention.

**Thirty seconds:** Patients get about eighteen minutes with a doctor and are interrupted eighteen seconds in. Meanwhile two-thirds have an error in their medication history — almost always something omitted, because nobody asked the right follow-up. Prologue calls before the appointment and loads the patient's FHIR record before it says hello. When someone books for "just a rash" and mentions a new prescription, Prologue connects those facts, checks the drug's labeling, flags it for the clinic, and runs a real eligibility check. Everything it produces is a draft with sources, and a clinician approves it item by item.

---

## User and problem

**Patient — Maria Delgado, 34.** Bipolar II managed by psychiatry. Divalproex two years; **lamotrigine started 22 days ago**. Books primary care for "itchy rash, arms and chest, few days." **Does not know lamotrigine can cause a dangerous rash** — different doctor, different problem, different month.

**Clinician — Dr. Amara Osei, family medicine.** 22 patients/day. Skeptical of AI output that arrives as confident prose. Her trust test: *can I see what the patient actually said, in one click?*

**The problem:** intake collects what it knows to ask. It never catches what the patient didn't know to mention.

| | |
|---|---|
| **18 seconds** | Before the physician interrupts. Only **23%** finish their opening statement |
| **67% / 91%** | Patients with a medication-history error / share of discrepancies that are **omissions** from how the history was taken |
| **2:1** | EHR hours per face-time hour, inside a **~18 minute** visit |

---

## Product insight

> **The pre-visit window is the only moment in the entire encounter with unlimited time and zero clinical attention. Today it's spent on a form that cannot ask a second question.**

A form is a fixed graph. Symptom checkers reason but are chart-blind. Scribes have the chart but arrive after the patient is in the room. Prologue is the only one holding all three.

---

## Magical demo moment

> **Maria:** "…both arms and some on my chest. Itchy. Maybe four days?"
>
> **Prologue:** "That helps. One thing I want to check — and it may be nothing. Your record shows you started lamotrigine about three weeks ago. Is that right?"
>
> **Maria:** "Yeah, my psychiatrist added it last month."
>
> **Prologue:** "Okay. A rash in the first couple of months on lamotrigine is something clinicians want to look at quickly — that's in the drug's own labeling. I'd rather someone from Dr. Osei's office call you today than wait for Thursday."

Then she interrupts mid-sentence — *"oh, my mouth's been sore too."* Mucosal involvement. The agent stops talking and escalates.

**Why it holds up:** lamotrigine carries an [FDA boxed warning](https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/022115s031s032lbl.pdf) for life-threatening rash; serious rash *"almost always occurred within 2–8 weeks"* of initiation; risk is **increased by concomitant valproate** — which is why she's on divalproex. She's day 22.

**Nobody wrote that question.** It came from her chart. And the agent never names a diagnosis — it routes urgency to the clinic, not alarm to the patient.

---

## MVP capabilities

**1. Chart-conditioned questioning** — the agent retrieves history mid-conversation and lets it determine the next question. *This is the innovation and the one thing that must never be faked.*

**2. Deterministic red-flag escalation** — a rule list, not a model, checked every turn, **failing closed**. Mucosal involvement, blistering, fever, dyspnea.

**3. Provenance-separated packet behind a review gate** — `SAID` / `INFERRED` / `UNKNOWN` structurally separate, every inference cited, and `Composition.status` reaching `final` **only** from the approval handler.

**Supporting beats:** medication reconciliation, a real 270/271 eligibility check, the doorknob question.

---

## Non-goals

- ❌ No diagnosis or condition name shown to the patient — **ever**
- ❌ No treatment advice; never *"stop taking that"*
- ❌ No autonomous chart writes
- ❌ No ED-vs-not triage — escalate to the *clinic*
- ❌ No image classification (the device line)
- ❌ **No cost total.** Benefits, never price
- ❌ No HIPAA compliance claim — synthetic data, said out loud

---

## Visualization

**The overlap timeline.** Horizontal axis in days since lamotrigine started. The medication bar runs the width; the **labeled 2–8 week risk window shades in**; the rash-onset marker drops **inside it**; divalproex runs underneath as the amplifier.

One frame, no reading, legible from the back row. It *is* the clinical argument.

Secondary: the reconciliation ledger, and the three-pane clinician packet.

---

## Three-minute demo

| Time | Beat |
|---|---|
| **0:00–0:20** | Cold open + consent, spoken and on screen. *"Synthetic data. Watch what her intake catches."* |
| **0:20–1:10** | The call. She tells her story uninterrupted. Function log shows retrieval at **63ms** — a real number on screen. Then the lamotrigine question. *"Nobody wrote that."* |
| **1:10–1:35** | **Barge-in.** She cuts the agent off. `check_red_flags` fires at 3ms, tagged deterministic |
| **1:35–2:00** | **The moment.** Timeline snaps up, window shades, marker lands inside. Escalation — call today, hold the dose, 911 if worse. **No diagnosis named** |
| **2:00–2:20** | Reconciliation catch + real 270/271. Header flips to *"async — outside turn budget."* Coverage stated as benefits, never price |
| **2:20–2:50** | **Clinician review.** Click a citation — **Maria's voice plays.** One inference rejected, rest approved. `preliminary → final` on screen |
| **2:50–3:00** | *"Every intake form asks what it knows to ask. Maria didn't know her rash and her prescription were the same story. Prologue did — because it read her chart before it said hello."* |

**The unscripted proof:** hand a judge the mic and let them **change one fact** — a different drug, a different onset. Retrieval fires live, the question changes, the timeline redraws. *If we only ever demo Maria, we've demoed a recording.*

---

## Biggest implementation risk

**Retrieval latency inside the turn.** The entire product is the chart-conditioned follow-up. Target **<100ms**; on a voice call a 700ms pause is *felt* in a way an on-screen spinner never is. If retrieval stalls, the premise dies — pre-warm the patient's slice at session start and **measure it before building anything else.**

Second: **drug-name ASR.** "Lamotrigine" must land. Mitigated by `agent.listen.provider.keyterms` loaded with her actual medication list.

---

## Why it could become a company

**The wedge:** the pre-visit window is owned by vendors shipping forms — Phreesia alone touches ~1 in 7 US visits with branching checkboxes and no clinical reasoning layer. The funded voice wave (Assort $222M, Hyro $95M) is uniformly administrative. **The gap is structural**: liability and a published 19–38% symptom-checker accuracy ceiling keep everyone in the logistics lane. Refusing to diagnose is what makes the position available.

**The asset:** linked triples of *what the patient said × what the chart held × what the clinician decided.* Nobody else is in the conversation, so nobody else can collect it.

**The buyer:** practices already paying for digital intake and receiving a form.
