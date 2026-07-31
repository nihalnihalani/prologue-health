# Countersign — Design Doc

**Event:** YC x Medplum Agentic Healthcare Hackathon — Sat Aug 1, 2026, Y Combinator SF
**Submissions close 5:00pm · Presentations 6:00pm · Awards 7:00pm**
**Goal:** First place (YC interview)

> Supersedes `2026-07-31-preflight-design.md`. Preflight was clinician-facing and in-visit; the organizers' published vision is patient-facing and pre-visit. The FHIR modeling, latency thesis, Stedi findings, and incumbent answers all carry over. The setting changed, not the plumbing.

---

## 0. The organizers' vision (what judges score against)

> *"Prior to your visit, you check in by talking to a voice agent and your conversation is charted for you as it happens... Any health issue you describe is deep researched, even if it's just a simple rash and the voice agent tailors the conversation with full context of your history. You receive n=1 treatment that's customized just for you. Your treatment plan is peer reviewed by experts, and your data is visualized... All this happens before you even see a doctor. And of course, you can ask how much treatment will cost ahead of time, and whether your insurance will cover it. That future is voice-first."*

Seven clauses. Every team will build clause one. **Almost nobody will build "peer reviewed by experts."**

---

## 1. The idea

**Countersign** — the voice-first pre-visit the organizers described, with a real clinician gate at the end.

A patient phones in before their appointment. A voice agent takes the intake, tailors its questions to their actual history, deep-researches what they describe, checks what it will really cost against their payer, and drafts a plan — all charted live as correct FHIR.

Then the draft **stops**. It cannot reach the patient until a clinician countersigns it in a desktop cockpit that shows *claim-level evidence* rather than a wall of generated text. The doctor approves in under a minute because every assertion is clickable back to the second the patient said it.

**The thesis in one line:** *Everyone else will build an AI that hands a patient a treatment plan. We built the one where it can't — and that gate is the product.*

The organizers wrote the safe harbor into their own vision statement. Most teams will render "peer reviewed by experts" as a static badge. Building it as a **real, load-bearing gate** solves the differentiation problem and the regulatory problem with the same code.

---

## 2. Architecture — and why Electron survives exactly here

**One codebase, two role-based views**, plus a phone entry point.

| Half | Platform | Why |
|---|---|---|
| **Patient intake** | **Phone call** (Twilio + Deepgram Voice Agent), cloud-hosted backend | Maximally theme-literal — the organizers wrote "you check in by talking to a voice agent." Zero install. **A judge dials it from their seat.** |
| **Clinician review view** | **Web** (single codebase, role-based route) | Lower risk in 3 days, no packaging, no notarization. |

### Electron: stretch wrapper, not a design constraint
Both advisors landed here independently, and the reasoning is sound: the persistent-all-day-queue benefit that would justify a desktop app **never appears on stage**, because the demo exercises one case once. Building a second shell buys nothing a judge can see.

**But the cost is near zero if the arc is done.** Every Electron risk previously identified — silent TCC failure on unsigned apps, the v40.1.0 loopback regression, the `Info.plist` code-signing trap — lives in `desktopCapturer` and microphone access. The review view touches **none** of it; it renders a queue and calls APIs. So if the pipeline works with time to spare, wrapping the clinician route in a minimal Electron `BrowserWindow` lets you truthfully say *"it also ships as a desktop app"* with no second UI build.

**Order of operations: arc first, wrapper last. Never the reverse.**

### Why the phone backend goes in the cloud, not a tunnel
Deploy the Twilio webhook + agent backend to a real host (Fly/Vercel/Render). Do **not** ngrok from the laptop. Then the hero path runs over the cellular network and **never touches conference wifi**. This makes the phone demo more robust than a laptop demo, not less.

### What we will NOT claim
- ❌ *"PHI is processed locally."* `safeStorage` is keychain string encryption for local secrets. It does nothing once audio reaches Deepgram and data reaches Medplum's cloud. The moment a CTO judge asks "where does the audio go?", this reads as not understanding HIPAA. **Never say it.**
- ❌ *"It's a kiosk, so it needs Electron."* Kiosk mode is a browser flag.
- ❌ Any Pavoot integration. **There is no public Pavoot API.**

---

## 3. Depth allocation

Four elements, three days. One goes deep; the rest are competently real.

**The rule: two stages hardened, two honestly thin, one working entry point.** Build the full arc so the completeness narrative holds — but only harden the two stages where "thin" reads as "fake."

| Element | Depth | Rationale |
|---|---|---|
| Voice intake | **Must work. Not "deep."** | It's the entry point and it *is* the demo. Table stakes, not a differentiation choice. |
| Deep research | **Honestly thin** | The brief says "deep researched," not "agentic multi-hop." One grounded retrieval with a **real, clickable citation** is a legitimate MVP. Thin is fine; *fake* is not. |
| n=1 plan generation | **Honestly thin** | An LLM call conditioned on real retrieved FHIR history isn't hard and reads as legitimate. |
| **The review gate** | **HARDENED — this is the product** | The one place thin *equals* fake. A "Reviewed by Dr. X" badge dies the instant a judge asks "what does the reviewer actually check?" Needs real logic and must **visibly edit or override the draft on stage**. |
| **Cost & coverage (Stedi X12)** | **HARDENED** | The place health-tech demos famously fake or skip. *"Did you actually hit a clearinghouse or is that mocked?"* is a reflexive gotcha for a judge with interop background — which describes Cody exactly. |
| Visualization | Cut first | Nice; not load-bearing. |

**Why these two:** the three things every team fakes with one confident LLM call are "deep researched," "peer reviewed by experts," and **"n=1 customized just for you."** Our two hardened stages map onto exactly where the median team is weakest.

### ⚠️ Correction to an earlier assumption
*An earlier draft argued real EDI wins because it's externally verifiable. That's overstated.* **Verifiability only counts if a judge actually verifies it** — and nobody queries the Stedi sandbox mid-demo. A real 271 and a hardcoded string look identical on stage. So:

- **Build the EDI request live from a detail the patient just gave on the call** (name/DOB collected naturally during intake). Then it demonstrably cannot be pre-scripted.
- **Put the raw X12 payload on screen** for ~2 seconds as a receipt.
- Realness must be a *demo moment*, not a backend property, or the engineering effort is invisible.

### ⚠️ The sandbox boundary probe
A judge's instinct on seeing something real is to test its edge: *"what if I say Blue Cross instead?"* A pre-registered-patients-only sandbox will visibly fail that, which reads **more fake than a hedged LLM estimate that at least answers plausibly.**

**Mitigation:** script the intake to naturally collect the identity that resolves to the registered test patient, and preempt out loud: *"We're hitting Stedi's clearinghouse sandbox live — it's scoped to a handful of pre-registered test patients, which is the same integration point production EHRs use."* Disclosed limitations read as engineering honesty. Discovered ones read as a caught lie.

**The three collapse points every other team will fake with one LLM call:** "deep researched," "peer reviewed by experts," and **"n=1 treatment customized just for you."** Customization without real FHIR-history-conditioned reasoning is prompt-stuffing a chief complaint into a template. Ours must be conditioned on retrieved history — that's what Moss is for.

---

## 4. Sponsor roles — all load-bearing

| Sponsor | Role | Why not decorative |
|---|---|---|
| **Deepgram** | Voice Agent API + **function calling** drives the intake. Nova-3 Medical + **keyterm prompting** (preload derm/clinical vocabulary — *pruritic, vesicular, tinea, herpes zoster*). Aura-2 speaks. **Word-level timestamps make every claim in the cockpit clickable back to the exact second it was said.** | Function calling fires the Stedi and research tools mid-conversation. Timestamps are what make the review gate trustworthy rather than decorative. |
| **Moss** | Sub-10ms on-device retrieval over patient history — **decides the agent's next question**, and in the cockpit scores each claim's evidentiary support so the doctor doesn't re-read the record. | **On a phone call, dead air is felt.** A 700ms retrieval pause before the agent responds is viscerally wrong in a way an on-screen spinner never is. Sub-10ms is what makes it feel human. This is the strongest Moss argument we've found. |
| **Medplum** | `Encounter`, `Observation`, `Condition`, `QuestionnaireResponse`, `CarePlan`, `DetectedIssue`, `Coverage`, `Claim`/`ClaimResponse`. Bots + Subscriptions. Live alpha CMS-0057-F prior-auth CDS Hooks at `api.staging.medplum.dev/cds-services`. | **`CarePlan.status` flips `draft` → `active` only on countersign.** That's the gate, modeled correctly in FHIR, and Cody will clock it instantly. |
| **Stedi** | Real 270/271 eligibility, then a **278 inquiry** for the authorization determination. | Nobody else will run a real EDI transaction. |
| **Pavoot** | — | No API exists. Not used. |

---

## 5. FHIR modeling (carried forward, verified)

**The gate:** `CarePlan.status` = `draft` on generation, `active` **only** after a real review action. Never write `active` from the intake agent. This is the single most important line of code in the demo.

**Safety findings:** `DetectedIssue`, `.code` = **`DRG`** (v3-ActCode "Drug Interaction Alert"). ⚠️ There is no `ALLERGY` code in `detectedissue-category` — do not invent one. `.severity` binding is exactly `high | moderate | low` — three values, don't add a fourth. `.implicated` → the proposed `MedicationRequest` and the conflicting `AllergyIntolerance`. `.mitigation` **empty at write time**; populate only if a real override is captured.

**Eligibility:** 270/271 → `CoverageEligibilityRequest`/`Response`. Benefit amounts in `insurance.item.benefit`; `insurance.item.preAuthRef` is a sibling, not nested. Reference the existing `Coverage`.

⚠️ **Do not trust the 271 auth-required flag.** HL7 built the entire Da Vinci **CRD** IG precisely because eligibility responses don't answer this reliably per-service, per-payer. And CRD isn't buildable here — it needs the *payer* to run a live CDS-Hooks rules service. **Go straight to a 278 inquiry** for a real determination (approved / pended / needs-more-info).

**Prior auth:** `Claim` with `use = preauthorization` → `ClaimResponse.preAuthRef`. The conformant path is Da Vinci PAS `Claim/$submit`; we hit Stedi's raw 278 REST endpoint, so **say plainly that we hand-map X12 into `Claim`/`ClaimResponse` rather than claiming PAS conformance.** Cody knows the difference and will respect the distinction being drawn. Name the three-stage flow correctly if asked: **CRD → DTR → PAS.**

⚠️ Not confirmed: the exact field path PAS uses to link `ServiceRequest` to `Claim`. If pressed: *"it travels in the submission Bundle alongside the Claim."* Don't name a field.

---

## 6. The regulatory line — build the responsible version and say so

| Clause | Risk | Handling |
|---|---|---|
| "charted... clinical documentation" | Safe | Established ambient-scribing category |
| "deep researched" | Safe *if* framed as patient education/reference | Never diagnosis |
| "tailors the conversation with full context" | Safe | Triage-style personalization |
| **"You receive n=1 treatment customized just for you"** | **HIGHEST RISK** | A specific individualized treatment recommendation reaching a patient before any clinician is involved is the closest thing here to practicing medicine without a license, and plausibly fails the FDA Non-Device CDS carve-out (which requires the intended clinician user to independently evaluate the basis). **Never label patient-facing output "your treatment plan." Label it "draft summary for your doctor to review" — and demo the gate.** |
| "peer reviewed by experts" | This is the safe harbor | Build it real and load-bearing |
| "data is visualized" | Safe | Standard patient-portal territory |
| "cost... coverage" | Administratively risky | Label as **estimate**; No Surprises Act disclaimer hygiene |

**The Cody test:** he gets uncomfortable the instant a patient-facing agent outputs something reading as final before clinician sign-off is visible on screen — *"who's liable if the patient acts on this?"* is an instant, embarrassing Q&A moment. He gets **impressed** by correct status modeling proving the gate is real rather than UI copy.

---

## 7. The demo — one continuous patient story (3:00)

Not a feature tour. One patient — **"Maria," chief complaint "just a rash"** — deliberately mirroring the brief's own example so judges recognize their own sentence being answered.

**Only TWO narrated beats.** Four beats at ~45s each is too thin for anything to land. Research and plan-generation exist in the build and are inspectable if a judge leans in — they get **zero spotlight time**. Research appears as an expandable citation footnote in the transcript. The draft plan is already on screen when beat 2 opens; we never narrate it appearing.

| Time | Beat |
|---|---|
| 0:00–0:15 | **Cold open.** *"We built the whole visit the organizers imagined — voice intake, research, a plan. But we refused to fake the two parts that actually matter: whether it's safe, and whether you can afford it. Someone call this number."* Real number on screen. **A judge dials from their seat.** |
| 0:15–1:30 | **BEAT 1 — the intake, live.** Maria describes a spreading rash. FHIR materializes on the projector as she talks — `Encounter`, `Observation`, `Condition`. Two things happen inside this beat without their own narration: research citations quietly populate the transcript margin, and **Moss surfaces an immunosuppressant on her med list in <10ms**, so the agent asks a sharp follow-up instead of a generic one. *"That follow-up wasn't scripted — it came from her chart, retrieved on-device while she was still talking."* Intake naturally collects name and DOB — **this is what the EDI call will be built from.** |
| 1:30–2:30 | **BEAT 2 — the climax: review gate flowing straight into the real coverage check.** Cut to the clinician view. The draft is already there, stamped **DRAFT — pending review**, `CarePlan.status = draft`. Three claims, each with an evidence chip: click one, it **jumps to the exact transcript timestamp and plays her saying it**. The review pass has flagged one claim as unsupported. Doctor overrides it, approves the rest → `CarePlan.status` flips `draft` → `active` **on screen**. Immediately, the coverage check fires — **built live from the DOB she gave 90 seconds ago** — real 270/271, then a 278 inquiry. Raw X12 on screen for 2 seconds. *"That's a live clearinghouse call, scoped to Stedi's pre-registered test patients — the same integration point production EHRs use."* |
| 2:30–3:00 | **Close.** Scroll the actual Medplum record assembled during the demo — `Condition`, `Observation`, `CoverageEligibilityResponse`, `ClaimResponse.preAuthRef`, `CarePlan` now `active`. *"Everything you just watched is sitting in FHIR right now, not on a slide. And nothing the AI drafted was ever called a treatment plan until a clinician signed it. That's not a limitation — that's the design."* |

### The honesty lines — say these before you're asked
- **On the chart:** *"This is a seeded demo record. Everything being charted right now, including the follow-up logic, is a real write happening live."*
- **On research:** *"The differential comes from a curated guideline set we indexed. In production this hits a live literature API — but the retrieval, ranking, and escalation action are real."*
- **On the Stedi sandbox:** *"Live X12, real wire format. The only synthetic part is that Stedi requires a pre-registered test member."*
- **On the reviewer:** *"Every citation resolves to a real timestamp. What's not real is clinical validation — no licensed physician verified this specific plan. This demos the trust mechanism, not a clinically approved output."*

**The line we hold:** everything that *writes data* happens live on screen. Pre-done off-screen: research corpus indexing, Stedi test registration, Maria's seeded chart, and the doctor persona knowing what to click.

### Non-negotiables
1. **Cloud-deploy the phone backend.** No ngrok. Cellular path, not venue wifi.
2. **Preempt the Stedi mock-patient ceiling** before a judge asks.
3. **Never say "PHI is processed locally."**
4. **Never label patient output "your treatment plan."**
5. Have the incumbent answers ready (§9).
6. Test the phone audio through the venue PA.

### Failure choreography
- **Judge's call fails to connect:** *"Phone networks — let me place it from here,"* and dial from a second device already known-good. If both fail, play a recording captured that morning, explicitly labeled as such.
- **Stedi stalls:** *"Payer round-trips are the one thing we don't control — here's the response from the same call we ran this morning."* Cached, honestly captioned, never implied live.
- **Deep research overruns:** it runs async by design; the conversation continues. This is a feature, not a save.

---

## 8. Build plan

### Day 0 (tonight)
- [ ] Register Deepgram, Stedi sandbox, Medplum, Twilio. One curl each to confirm.
- [ ] **Register the Stedi demo patient.** Record the exact member/payer/DOB combo — the sandbox rejects anything else.
- [ ] Seed a Medplum demo patient with `AllergyIntolerance`, `MedicationRequest` (include the immunosuppressant), `Condition` history, `Coverage`.

### Day 1 — the voice loop, end to end
- [ ] Twilio inbound number → **cloud-hosted** webhook → Deepgram Voice Agent. Nova-3 Medical, keyterm prompting, word-level timestamps ON (the cockpit depends on them).
- [ ] Function calling scaffolded with two tools: `lookup_history` (Moss) and `check_coverage` (Stedi).
- [ ] Medplum auth + live charting: `Encounter`, `Observation`, `Condition` written during the call.
- **Exit criterion:** you can call a real phone number, talk, and watch FHIR appear in Medplum.

### Day 2 — depth on the two that matter
- [ ] Moss index over patient history. **Measure real latency; don't assume 10ms.**
- [ ] History-tailored follow-up question (the immunosuppressant beat).
- [ ] Stedi 270/271 → then 278 inquiry → write `CoverageEligibilityResponse` + `Claim`/`ClaimResponse` to Medplum.
- [ ] Draft `CarePlan` generation, **status hardcoded `draft`** with no code path that writes `active` outside the cockpit.
- [ ] Citation-grounded research with real, clickable sources.
- **Exit criterion:** a full call produces a draft CarePlan, a real payer response, and cited research.

### Day 3 — the cockpit, then rehearse
- [ ] Electron cockpit: review queue, claim-level evidence chips, audio playback seeked by Deepgram timestamp, approve/reject.
- [ ] The review pass that flags an unsupported claim (this must actually work — it's the hero).
- [ ] `draft` → `active` transition on countersign; reject → `Task` back to the intake agent.
- [ ] Cached fallbacks for every network call.
- [ ] **Rehearse 5× end to end including every failure line**, on the real phone, at venue volume.

### Cut order at 2am on day 3
1. Visualization
2. Deep research → single cited lookup
3. The cost beat → cached response, honestly captioned
4. **Never cut the countersign gate.** It is the product.

---

## 9. Incumbents — know them cold, volunteer them

| Who | What | When |
|---|---|---|
| Abridge + Availity | Real-time PA at point of conversation | Jan 2026 |
| Cohere Health + Microsoft Dragon Copilot | Ambient listening → payer submission during visit | Oct 2025 |
| Abridge / Ambience / Suki / Nabla / Freed | Ambient documentation (Abridge ~30% share, Best-in-KLAS 2025+2026) | — |

**The answer:** *"Ambient documentation is solved and we're not competing with it. Cohere and Availity both announced ambient-to-prior-auth in the last nine months — we're not claiming we got there first either. What none of them ship is a hard gate between an AI-generated plan and a patient. That's the part that decides whether any of this is deployable, and it's the part we built."*

**Do not claim blue ocean.** Diana Hu will respect the candor over a false story.

---

## 10. The pitch

**Problem:** Every AI in this space generates clinical content faster than a clinician can verify it — so either a human re-reads everything (no time saved) or nobody does (nobody can deploy it).

**Solution:** Countersign runs the full voice-first pre-visit — intake, history-tailored questioning, cited research, a real payer cost check — and then holds the output behind a clinician gate where every claim is evidence-linked and approvable in under a minute.

**Why us:** We built the verification surface, not another generator. Every assertion is clickable back to the second the patient said it, and the FHIR status literally cannot reach `active` without a signature.

**Why now:** On-device retrieval got fast enough to steer a live phone conversation, and real-time voice agents only became viable in the last 18 months — but the reason nobody has deployed them at scale is the trust gap, not the capability gap.
