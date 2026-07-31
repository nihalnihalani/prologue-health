# Preflight — Design Doc

**Event:** YC x Medplum Agentic Healthcare Hackathon — Sat Aug 1, 2026, Y Combinator SF
**Submissions close:** 5:00pm PT · Presentations 6:00pm · Awards 7:00pm
**Goal:** First place (YC interview)
**Date written:** 2026-07-31

---

## 1. The idea

**Preflight** — an Electron desktop copilot that sits inside a live telehealth visit and clears every order *while it's still being spoken*.

The instant a clinician starts to voice a plan — *"and let's start her on amoxicillin"* — Preflight checks it against the patient's chart on-device, in under 10ms, and interrupts **before the sentence finishes**:

> *"Hold on — she's on warfarin, amoxicillin raises bleeding risk. Want a lower-risk alternative pulled up?"*

That is the hero, and it is the only thing the agent ever says out loud.

In parallel and **silently**, a coverage card appears on screen: a real X12 278 inquiry to the payer, drafted `Claim` (`use = preauthorization`), status shown honestly as `pending`. The clinician reviews and sends when ready. Nothing about cost or authorization is ever spoken into the visit.

Everything lands as correct FHIR in Medplum — `DetectedIssue` for the safety finding, `Claim`/`ClaimResponse` for the authorization.

**One-liner:** *Epic catches the drug interaction when you type the order. Preflight catches it before you've finished saying it out loud — so the patient never hears a plan get walked back.*

---

## 2. Why this, and not the six alternatives

Seven ideas were generated and adversarially attacked. What killed the others:

| Idea | Killed by |
|---|---|
| Eligibility Ghost | Agentic loop is "look up and display." Everyone will build a 270/271 checker. |
| Waiting Room Whisperer | A PWA with the Notifications API gets 80% of it. Weak desktop justification. |
| Referral Runner | Solid, underrepresented — but no visceral stage moment. Held as backup. |
| ShadowSign | **CDS Hooks already does allergy checking natively in Epic/Cerner.** And legacy EHRs run over Citrix/VDI as streamed pixels — no accessibility tree to read. The one differentiating claim is the one thing that can't be demonstrated. |
| Claims Detective | Building your own fake IVR and demoing it *to the Deepgram judges*. Plus Electron has zero native telephony — 1–2 days lost to Twilio media streams and an ngrok tunnel over conference wifi. |
| HauntedEHR | Highest ceiling, highest variance. GUI automation visibly breaks on stage. |
| Prior Auth Autopilot | Right domain, wrong shape: the payoff is a macOS notification banner (invisible on a projector), "Autopilot" framing is a liability nonstarter, and Moss's speed is irrelevant to a bottleneck measured in days. |

**Preflight is Prior Auth Autopilot with the three fatal flaws removed:** the trigger moves from a background subscription to the spoken moment (which makes latency genuinely load-bearing), the framing moves from autonomous to clinician-confirmed, and the payoff moves from a notification to a spoken answer inside the conversation.

### The strategic bet

*An earlier draft of this doc argued coverage was the differentiated half. That was wrong on two counts, corrected below.*

**Both halves have live incumbents.** Cohere Health + Microsoft Dragon Copilot (Oct 2025) already pipes ambient listening into real-time payer submission during the visit. Availity + Abridge (Jan 2026) does medical-necessity review and PA initiation during the encounter. Neither half is cleanly "less commoditized." The deciding question is not *which is newer* but **which one still has a defensible answer to the incumbent objection.**

Safety has one. Coverage doesn't.

**The safety answer — point-of-utterance vs. point-of-order-entry.** Epic's interruptive allergy check fires when the order is entered into CPOE. In a live visit that happens *after* the clinician has already said the plan out loud to the patient — sometimes minutes later during post-visit charting. Once a clinician has verbally committed to a plan in front of a patient, there is documented behavioral inertia to follow through even when the EHR alert fires; it is part of why override rates are so high.

A sub-10ms, fully on-device check that fires *while the sentence is still being spoken* intercepts **before the verbal commitment exists**.

> To "what did five minutes earlier buy you?" the answer is not *five minutes*. It is: **the patient never hears a plan get walked back.**

That is a different intervention point, not a speed claim. It is also why **Moss is the linchpin of the thesis rather than a garnish** — the wedge only exists if the check completes before the sentence does. If retrieval takes 700ms, the clinician has finished speaking and the entire argument collapses.

**The coverage answer doesn't hold.** "Review and send?" fixes the liability problem (real, keep it) but not the alert-fatigue objection — Abridge's public position is not "don't quote dollar amounts," it's *don't interrupt the conversation at all, surface in the flow*. A spoken "that needs prior auth" is structurally still an interruption with a softer payload. A physician judge sees through the rewording.

So: **safety is the hero and is spoken. Coverage stays in the build but is a silent on-screen card, never spoken.** This means we take the "you interrupt, we deliberately don't" objection **once, not twice**, and we never claim the PA leg is the innovation.

---

## 3. Verified ground truth

Everything below was confirmed against live sources. Anything not confirmed is marked.

### Sponsor access — all self-serve today
| Sponsor | Status |
|---|---|
| **Deepgram** | `console.deepgram.com/signup`, no card, $200 credit auto-granted. Voice Agent API **GA since June 2025** — no waitlist. |
| **Stedi** | `stedi.com/create-sandbox`, ~2 min, no contract. Real 270/271, 276/277, 278, 837P. |
| **Medplum** | `app.medplum.com/register`, self-serve Project creation. |
| **Moss** | `npm i @inferedge/moss` — on-device Rust/WASM semantic search, sub-10ms. |
| **Pavoot** | **No public API. Not integrable.** Do not attempt. |

⚠️ **Moss name collision:** searching "Moss API" surfaces `getmoss.com`, an unrelated expense-management company. Yours is `moss.dev` / `@inferedge/moss` / InferEdge (YC F25).

### FHIR modeling — the Cody Ebberson answers

**Safety half — `DetectedIssue` is correct** (not `Flag`, not `RiskAssessment`, not a persisted `OperationOutcome`).
- `.code` = **`DRG`** ("Drug Interaction Alert", v3-ActCode). ⚠️ **There is no `ALLERGY` code** in `detectedissue-category` — do not invent one.
- `.severity` — required binding, exactly `high | moderate | low`. Three values. Collapse Moss's alert tiers onto these; do not add a fourth.
- `.implicated` → the proposed `MedicationRequest`/`ServiceRequest` **and** the conflicting `AllergyIntolerance`.
- `.evidence.detail` → reference the `AllergyIntolerance`.
- `.author` → `Device` (the agent).
- `.mitigation` — **leave empty at alert time.** Only populate if the clinician's override/withdrawal is actually captured. Writing a fabricated mitigation misrepresents the resource.
- Idiomatic pattern: **CDS Hooks card for the real-time nudge, `DetectedIssue` as the persisted record.** Both, not either/or.

**Coverage half — the Da Vinci three-stage flow**, in order:
1. **CRD** (Coverage Requirements Discovery) — CDS Hooks at order time: *is prior auth even needed?*
2. **DTR** (Documentation Templates and Rules) — assembles the payer's required documentation via FHIR Questionnaire/CQL.
3. **PAS** (Prior Authorization Support) — submits via **`Claim/$submit`** with a PAS Request Bundle; the server converts it to **X12 278**, runs it against the payer, converts the response back to a `ClaimResponse`. Auth number returns as **`ClaimResponse.preAuthRef`**, later carried into the billing claim's `Claim.insurance.preAuthRef`.

**Eligibility** — `CoverageEligibilityRequest.purpose` accepts exactly four codes: `auth-requirements`, `benefits`, `discovery`, `validation`. Benefit amounts land in `insurance.item.benefit`; `insurance.item.preAuthRef` is a sibling, not nested. Reference the existing `Coverage` — don't create a new one per check.

⚠️ **Do not build on the 271 auth-required flag.** The FHIR code `purpose = auth-requirements` exists, and 271 responses *can* carry a prior-auth signal (EB segment + free-text MSG). But it is not reliable per-service, per-payer — and the proof is structural: **HL7 built the entire Da Vinci CRD implementation guide precisely because eligibility responses don't answer this dependably.** If the 271 flag worked, CRD wouldn't need to exist.

**And CRD isn't buildable with this stack.** CRD requires the *payer* to run a live CDS-Hooks rules service; there is no public CRD sandbox comparable to Stedi's, and Stedi is a pure X12 clearinghouse (270/271, 276/277, 278, 837P). So the strategically "correct" differentiated layer is unavailable regardless of desirability.

**The buildable, correct path: go straight to a 278 inquiry.** That returns a real payer determination — approved / pended / needs-more-info — rather than an inferred guess. This is the right call independent of the hero-feature debate.

**⚠️ Honesty requirement:** we will be hitting **Stedi's raw 278 REST endpoint**, not a PAS `$submit` server. Say plainly that we hand-map X12 into `Claim`/`ClaimResponse` rather than claiming PAS conformance. Cody knows the difference and will respect the distinction being drawn.

**⚠️ Not fully confirmed:** the exact field path PAS uses to link the source `ServiceRequest` to the `Claim`. If pressed, say *"it travels in the submission Bundle alongside the Claim, and the Claim's item lines reference the ordered service by code"* — do not name a specific field.

### The gift: Medplum's own prior-auth alpha
Medplum ships a live **"Electronic Prior Auth"** integration built explicitly for **CMS-0057-F**, currently alpha:
- CDS Hooks discovery: `GET https://api.staging.medplum.dev/cds-services`
- Auth: client ID+secret, JWT client assertion w/ JWKS, or optional mTLS
- Staging is "generally available 24/7," no SLA, test data may reset

Their blog lists "Preparing for 2027 Prior Auth Regulatory Requirements" on the 2026 roadmap. **Building against the judge's own active roadmap feature is the single strongest alignment available at this event.**

Do **not** claim Medplum "ships Da Vinci PAS profiles" — not confirmed. Claim it ships CDS Hooks plus standard `Claim`/`ClaimResponse`/`CoverageEligibilityRequest`, which is what CRD/PAS are built on.

### Business case
- **39 prior auths per physician per week, ~13 hrs** of physician+staff time; **40%** of physicians employ staff whose sole job is PA (AMA 2024, n=1,000)
- Only **35% of prior auths are fully electronic** vs **96% of eligibility checks** (CAQH 2024) — eligibility is solved, PA is not
- **Prior-auth failures = 34% of first-pass denials**, up from 22% in 2023 (Experian 2025). **86% of denials are avoidable.**
- **CMS-0057-F**: decision timelines (72hr urgent / 7 day standard) live **Jan 1 2026**; payer FHIR APIs required **Jan 1 2027**

**Why now:** payers are mid-buildout of exactly these APIs right now. Be honest that they aren't universally live until 2027, so today's integration rides Stedi's existing X12 rails with FHIR APIs as the upgrade path.

### Legal
- **FDA — good news.** Final CDS guidance (Jan 29, 2026) uses drug-drug and drug-allergy interaction alerts as its *own textbook example* of **Non-Device CDS**, exempt from device regulation — provided the system is transparent about its evidentiary basis and doesn't replace clinical judgment. Showing the `DetectedIssue` basis in the UI satisfies this. **Always show "why."**
- **California all-party consent (Penal Code §632) — active risk.** Sharp HealthCare was sued in Jan 2026 over AI-scribe recording without adequate patient consent. Build a consent step in from day one and show it in the demo — it doubles as trust signaling.
- **AI submitting medical-necessity attestations** — no primary-source prohibition found, and Rhyme/Cohere already submit programmatically under the ordering provider's NPI. But the attestation is legally tied to the licensed clinician, so **keep the confirmation step**. Say "clinician-in-the-loop by design, pending real legal review" — do not claim it's cleared.

---

## 4. What each sponsor does (all load-bearing, none decorative)

| Sponsor | Role | Why it's not decorative |
|---|---|---|
| **Deepgram** | Nova-3 Medical + diarization + **keyterm prompting** (up to 100 terms — preload the patient's drug/condition list). Voice Agent **function calling** fires the checks. Aura-2 speaks the answer. | Function calling is the underused feature the Deepgram judges want to see. Keyterm prompting is why "lumbar" isn't transcribed as "number." |
| **Moss** | On-device sub-10ms retrieval over the patient's allergies, active meds, and conditions. | **The linchpin of the entire thesis.** The wedge is "we intercept before the verbal commitment exists" — that only works if the check completes before the sentence does. At 700ms the clinician has finished speaking and the argument collapses. On-device (no network hop) is what makes it structurally possible. |
| **Medplum** | `DetectedIssue`, `ServiceRequest`, `Claim`/`ClaimResponse`, `CoverageEligibilityRequest`/`Response`, plus their alpha CMS-0057-F CDS Hooks endpoint. | Correct FHIR, on the CTO's own roadmap. |
| **Stedi** | Real 270/271 with `auth-requirements`, real 278. | Nobody else in the room will run a real EDI transaction. |
| **Pavoot** | — | No API exists. Not used. |

---

## 5. Why Electron (scoped honestly)

**The real claim:** OS-level loopback audio capture lets Preflight hear *both sides* of a visit conducted in a **native desktop telehealth client** — Zoom's desktop app, Doximity — without any platform integration. Zoom's Web SDK exposes no raw audio at all; the native Meeting SDK requires host/co-host status or a bot participant. So loopback is genuinely the only integration-free path there.

**What we must NOT claim:** that this is universal. For *browser-based* telehealth (Doxy.me, Zoom-in-browser), a Chrome extension using `tabCapture` does the same job with less risk. Overclaiming here is the exact mistake that killed ShadowSign.

**The honest line:** *"For native desktop telehealth clients, OS loopback is the only integration-free way to hear the patient. For browser-based visits we ship an extension. We pick the capture path per platform."*

Secondary genuine desktop advantages: `safeStorage` keychain-backed credential encryption (**not** full at-rest DB encryption — don't overclaim), background daemon, global hotkey, local-first audio processing.

---

## 6. The demo (3:00)

**Hero moment:** the agent interrupts *mid-sentence*, before the clinician finishes saying the plan out loud.

| Time | Beat |
|---|---|
| 0:00–0:12 | **Cold open, no preamble.** Live telehealth call on screen, consent banner visible: *"AI assistant monitoring this visit."* Doctor, mid-flow: *"Okay, for the infection I'm going to start you on amoxi—"* — cut off at ~9ms by Aura-2: *"Hold on — she's on warfarin, amoxicillin raises bleeding risk. Want a lower-risk alternative pulled up?"* Doctor, to patient, smoothly: *"Actually, let's do doxycycline."* **The patient never heard a plan get walked back.** That's the whole product in twelve seconds. |
| 0:12–0:30 | **The line.** *"Epic would have caught that too — when he typed the order, ninety seconds later, after he'd already told her she was getting amoxicillin. We caught it before he finished the word. That's not a speed improvement, it's a different intervention point."* |
| 0:30–0:50 | Overlay reasoning panel replays what streamed live: `Nova-3 Medical + keyterms` → `drug detected: amoxicillin` → `Moss on-device: warfarin interaction, severity high` → `INTERRUPT @ 9ms`. *"You just watched the entire decision. On-device. Nothing left the laptop."* |
| 0:50–1:20 | **The Moss race.** Same trigger fires two live pipelines side by side from a shared t=0: `MOSS — ON DEVICE` vs a genuinely cloud-hosted comparator (real embedding API + real hosted index, same corpus). Moss freezes at ~9ms with the interrupt already spoken; the cloud counter is still visibly climbing while the doctor finishes the sentence. **No `setTimeout`. Real numbers, different every run.** *"At 700ms he's already said it. The whole product is that gap."* |
| 1:20–1:40 | **FHIR proof.** Cut to the live Medplum console: real `DetectedIssue`, `code=DRG`, `severity=high`, `implicated` → the `MedicationRequest` and the `AllergyIntolerance`. Flash raw JSON for one second. *"`DetectedIssue` — the R4 resource built for exactly this. Not a Flag, not a RiskAssessment."* |
| 1:40–2:05 | **Judge-driven proof.** *"Cody — name a drug."* Live, unscripted. Include one that comes back clean, to prove it isn't rigged to always alarm. |
| 2:05–2:30 | **The coverage card — silent, and honestly framed.** Point to the on-screen card: `MRI lumbar spine · 278 inquiry sent to Aetna · pending`. *"Cohere and Availity both announced ambient-to-prior-auth in the last nine months. We're not claiming we got there first. This is the FHIR-correct version of it, on a stack we stood up in three days — a real X12 278, hand-mapped into Claim and ClaimResponse. And notice it never says a word out loud. Cost conversations don't belong in the middle of a visit."* |
| 2:30–3:00 | **Close.** *"Ambient scribes document the visit after it ends. Preflight changes what happens in it. The patient never hears a plan get walked back."* |

### Non-negotiable demo rules
1. **The agent speaks exactly once, and only about safety.** Nothing about cost, coverage, or authorization is ever spoken into the visit — those appear as a silent on-screen card. A 271 cannot produce a trustworthy patient cost (deductible-remaining, copay-vs-coinsurance, secondary payers), so any copay shown must be labeled **"estimate — not final"** and never voiced. This also means we take the alert-fatigue objection once rather than twice.
2. **Preempt the Stedi mock-data ceiling before anyone asks.** State up front that Stedi's sandbox clears only pre-registered member/payer/DOB combos, show the registered patient, and frame it as *"the exact call your production integration makes, against Stedi's certified test payer."* If pressed: *"That's a Stedi sandbox constraint, not a FHIR one — happy to show the payload."*
3. **Consent banner visible on screen the whole time.** California is an all-party consent state and you are demoing in California.
4. **Confirm the Aura-2 voice routes through the venue PA**, not laptop speakers. The loudest beat is inaudible past row 3 otherwise.
5. **The Abridge answer, ready verbatim** (see §8).

### Failure choreography
- **Voice/order detection misses:** *"Let's watch that one again in slow motion"* → deterministic replay of the already-captured trace. Honest — it did happen.
- **Stedi call stalls:** *"Payer round-trips are the one thing we don't control — here's the response from the same call we ran this morning,"* then a cached response with the transcript animating in sync. Explicitly "this morning," never implied live.
- **Loopback audio dead:** fall back to mic-only. The demo still works; the pitch narrows to in-room visits for 3 minutes.

---

## 7. Build plan

> **Day 1 hour 1 is not code.** It is verifying loopback audio on the actual demo machine. If that path is broken on your macOS + Electron combination, you need to know at 9am on day 1, not 2am on day 3.

### Day 0 (tonight, ~1 hour)
- [ ] Register: Deepgram, Stedi sandbox, Medplum. Confirm keys work with one curl each.
- [ ] Read Stedi's mock-request doc and **register the demo patient**. Record the exact member/payer/DOB combo.
- [ ] `npm create @quick-start/electron@latest -- --template react`. Pin the Electron version.

### Day 1 — De-risk the native layer, then the spine
- [ ] **Loopback audio test on the demo machine.** `electron-audio-loopback`. Verify against a real Zoom call.
- [ ] **Code-sign immediately:** `codesign --force --deep --sign -` after every build touching `Info.plist`. Add `NSMicrophoneUsageDescription` to `extendInfo`. Call `desktopCapturer.getSources()` once on launch to force TCC registration.
- [ ] Install BlackHole as fallback. Test it too.
- [ ] Deepgram streaming STT with Nova-3 Medical + diarization + keyterm prompting.
- [ ] Medplum client-credentials auth; seed a demo Patient with `AllergyIntolerance`, `MedicationRequest`, `Coverage`.

**Day 1 exit criterion:** spoken words from a live Zoom call appear as diarized transcript in the app. If this isn't true by end of day 1, drop to mic-only and keep moving.

### Day 2 — The agent loop
- [ ] Deepgram Voice Agent function calling. Two tools: `check_coverage(service, patient)` and `check_safety(drug, patient)`.
- [ ] Stedi `CoverageEligibilityRequest` with `purpose=auth-requirements` → parse 271 → auth required y/n.
- [ ] Stedi 278 submit → hand-map response to `Claim`/`ClaimResponse` → write `preAuthRef` to Medplum.
- [ ] Moss index over the patient chart + payer rules. Measure real latency — do not assume 10ms.
- [ ] `DetectedIssue` writer: `code=DRG`, severity on the three-value scale, `implicated` populated, `mitigation` empty.
- [ ] Aura-2 TTS response. **Draft the spoken sentence carefully — no dollar amounts.**

**Day 2 exit criterion:** speak an order → agent speaks the coverage answer → correct FHIR lands in Medplum.

### Day 3 — Make it legible, then rehearse
- [ ] Overlay UI: streaming reasoning panel (~1.5s/line, never a spinner).
- [ ] The Moss race: real cloud comparator, two live counters, shared t=0.
- [ ] Consent banner.
- [ ] Medplum console cut + raw JSON flash.
- [ ] Cached-response fallback path for every network call.
- [ ] **Rehearse 5× end to end, including every failure line.** On the demo machine, on the venue's display, at venue volume.
- [ ] Prepare the Abridge answer and the mock-data preempt as spoken lines, not improvisation.

### Cut order when it's 2am on day 3
1. Overlay polish
2. Live Stedi call → cached response with honest caption
3. The coverage card entirely — **safety is the hero and must stand alone**
4. The Moss race — cut last. It is the proof of the core claim, not a garnish.

---

## 8. Honest risks

**The incumbent problem — there are three, all recent. Know them cold.**

| Who | What | When |
|---|---|---|
| **Cohere Health + Microsoft Dragon Copilot** | Ambient listening triggers Cohere agents to submit care requests with real-time payer feedback *during the visit* | Oct 2025 |
| **Abridge + Availity** | Medical-necessity review and PA initiation at the point of conversation | Jan 2026 |
| **Epic / Cerner via CDS Hooks** | Drug-allergy and interaction checking at order entry | ~decade |

A judge who follows voice-AI-in-healthcare — which describes at least three people on this panel — can raise Cohere/Dragon Copilot cold. Not knowing it reads as failed competitive research, which is worse than picking a hard market. **Volunteer it before you're asked.**

**The answer to Epic (the one that matters, since safety is the hero):**
> *"Yes — and Epic fires that check at order entry, which in a live visit happens after the clinician has already told the patient the plan. There's well-documented inertia to following through on something you've said out loud to a patient's face; it's part of why override rates are what they are. We fire on-device in under ten milliseconds, before the sentence finishes. That's not five minutes earlier — it's before the commitment exists."*

**The answer to Cohere/Availity (for the coverage card):**
> *"Both announced ambient-to-prior-auth in the last nine months. We're not claiming we got there first. What we're showing is the FHIR-correct version — a real X12 278, hand-mapped to Claim and ClaimResponse — on a stack we stood up in three days. And ours doesn't say it out loud."*

**Beachhead argument, if pushed on go-to-market:** Cohere sells to payers; Abridge sells to enterprise health systems. Telehealth-native startups and small specialty practices are not who either is selling to, and won't be for years given those sales motions. That's a beachhead-and-expand claim, not a no-competition claim — and Diana Hu will respect the candor over a false blue-ocean story.

**The alert-fatigue objection, which we still take once:** Abridge's public position is *don't interrupt at all — surface in the flow*. Our answer is that we interrupt exactly once, only for high-severity interactions, only on-device, and only before the plan is verbalized — and that the whole point is that an in-flow card *after* the verbal commitment is precisely what doesn't work. Making coverage a silent card means we take this objection **once, not twice.**

**Other live risks:**
- Electron loopback has an **open capture regression in v40.1.0**. Pin a version, test early, keep BlackHole.
- Unsigned apps **silently** fail macOS TCC — no prompt, no error, black/silent capture.
- Stedi sandbox can't handle an arbitrary patient. Preempt it.
- Alert fatigue is a real objection: Abridge deliberately avoids interruptive alerts. Our answer is that **coverage is not a clinical alert** — it's information the clinician actively wants at that moment, and it's clinician-confirmed, not an interrupt.

---

## 9. The 10-year story

The unique asset: **point-of-utterance clinical intent** (what the clinician actually said, timestamped) **linked to real payer outcome** (approved/denied, turnaround, price) at the FHIR-resource level. Cohere and Rhyme sit payer-side and never hear the conversation. Abridge sits in the conversation but funnels through Availity rather than owning an independent dataset.

At scale this becomes a predictive layer — *for payer X, diagnosis Y, procedure Z: probability of approval, expected turnaround* — sellable to payers (consistency and audit, newly valuable under CMS's reporting mandate) and to practices (pre-submission accuracy filter).

**Honest caveat:** any volume-based moat argument must reckon with Abridge's 80M-conversation head start. The credible version is *"we out-execute on a beachhead their enterprise motion ignores, and the dataset compounds"* — not a data-volume race.

---

## 10. The pitch

**Problem:** Every EHR checks a prescription for interactions — but it checks when the order is *typed*, which in a real visit is after the doctor has already told the patient what they're getting. Walking a plan back in front of a patient is something clinicians avoid, which is part of why alert override rates are what they are.

**Solution:** Preflight listens to the visit itself and checks the patient's chart on-device in under ten milliseconds — fast enough to interrupt before the sentence finishes, so the plan is never verbalized in the first place. Coverage and prior auth are handled silently on screen in the same pass.

**Why us:** We built the two pieces a browser-based scribe structurally cannot ship — OS-level loopback capture that hears the patient through a native telehealth client, and fully on-device retrieval fast enough to beat human speech — and wired them into real FHIR, not a transcript someone else has to act on.

**Why now:** On-device semantic retrieval got fast enough to beat a spoken sentence, and real-time voice-agent latency only became viable in the last 18 months. Neither was true two years ago.
