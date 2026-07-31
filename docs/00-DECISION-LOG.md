# Decision Log — How We Got to Prologue

*A record of every idea generated, every idea killed, and every reversal. Kept because the reasoning is more reusable than the conclusion — and because several of the killed ideas were killed for reasons worth remembering.*

The design was produced by an adversarial process: an ideator generating candidates, a researcher verifying every factual claim against primary sources, a devil's advocate whose only job was to kill ideas, a demo designer, and a business-case analyst. **The devil's advocate was right three times against my own position.** Those are marked below.

---

## Timeline of the idea

```
Round 1 — Electron-framed, clinician-facing
  7 concepts → ShadowSign, Prior Auth Autopilot, Claims Detective as finalists
      ↓ devil's advocate kills 2 of 3
Round 2 — Preflight (merged safety + money, in-visit)
      ↓ organizers publish their vision: patient-facing, pre-visit, voice-first
Round 3 — Countersign (the review gate as hero)
      ↓ full re-derivation against the actual theme
Round 4 — PROLOGUE (chart-aware pre-visit voice intake + review gate)
      ↓ sponsor docs read; two findings force revisions
FINAL
```

---

## Round 1 — seven Electron concepts (clinician-facing)

The original framing was "an Electron desktop app." Seven concepts were generated with deliberately different wedges.

| # | Idea | Outcome |
|---|---|---|
| 1 | **Eligibility Ghost** — floating badge shows copay when a chart opens | ❌ Thinnest agentic loop — "look up and display." Everyone builds a 270/271 checker |
| 2 | **Waiting Room Whisperer** — kiosk hears "chest pain," alerts staff | ❌ A PWA with the Notifications API gets 80% of it. Weak desktop justification |
| 3 | **Referral Runner** — drop a scanned fax in a folder, get a booked specialist | ⚠️ Genuinely underrepresented category, real problem, no visceral demo moment |
| 4 | **ShadowSign** — HUD interrupts mid-prescription over any EHR | ❌ **Killed — see below** |
| 5 | **Prior Auth Autopilot** — menu-bar daemon files the 278 automatically | ⚠️ Survived with surgery, later superseded |
| 6 | **Claims Detective** — voice agent navigates payer IVR phone trees | ❌ **Killed — see below** |
| 7 | **HauntedEHR** — speak a command, watch the cursor drive a legacy EHR | ❌ Highest ceiling, highest variance; most likely to visibly break |

### Why ShadowSign died

Two independent kill shots, neither fixable by better engineering:

1. **CDS Hooks already exists.** It's an adopted HL7 standard, live in Epic/Cerner/Meditech today, firing allergy and interaction checks natively at order entry. *"Doesn't Epic already do this?"* has a damaging answer: **yes, for over a decade.**
2. **Legacy EHRs are Citrix/VDI-streamed.** The very systems the pitch claimed as its wedge render as *pixels of a video stream*. There is no local accessibility tree to read. **The single differentiating claim was the one thing that could not be demonstrated** — and our own pre-bake plan (build our own mock EHR) conceded it.

**Lesson:** a real mechanism stretched into a universal claim ("works with any EHR") dies to one question from a technical judge.

### Why Claims Detective died

Building our own fake IVR tree and demoing it **to the Deepgram judges** — who have seen dozens of phone-tree agent demos — is the least convincing possible version of that pattern. Separately, Electron has zero native telephony; the build would have burned 1–2 of three days on Twilio media streams and an ngrok tunnel over conference wifi before any healthcare logic existed.

**Lesson:** distinguish *reducible* risk (more engineering fixes it) from *irreducible* risk (a live phone call over conference wifi doesn't get safer because you wrote more code).

### Why Prior Auth Autopilot needed surgery

- **Moss's sub-10ms retrieval was irrelevant to the actual bottleneck.** Real payer prior-auth latency is hours to days. The fast technology didn't address the slow part of the problem.
- **"Autopilot" was a liability nonstarter** — autonomously submitting a medical-necessity attestation with no clinician sign-off reads as reckless to a healthcare-native judge, not impressive.
- **The payoff was a macOS notification banner** — invisible on a projector from 20 feet. The demo designer scored it **4/10**: *"everything valuable happened invisibly; the audience has to take your word for it."*

---

## Round 2 — Preflight, and three reversals

Preflight merged the safety and money halves into one in-visit agent. It didn't survive contact with the evidence.

### ⛔ Reversal 1 — I was wrong that "money" was the differentiated half

I argued prior-auth-at-point-of-speech was less commoditized than allergy checking. The devil's advocate found the counter-evidence:

- **Cohere Health + Microsoft Dragon Copilot** (Oct 2025) — ambient listening triggers agents to submit care requests with real-time payer feedback **during the visit**.
- **Abridge + Availity** (Jan 2026) — medical-necessity review and PA initiation **at the point of conversation**.

Both halves had named, dated incumbents. My premise didn't hold.

### ⛔ Reversal 2 — Abridge already tested and rejected the core interaction

Abridge's public CDS position is that they **deliberately avoid interruptive alerts** because of alert fatigue, surfacing insights in-flow instead. The headline differentiator wasn't an innovation they missed — it was a UX choice they walked away from at ~100M conversations/year.

### ⛔ Reversal 3 — the 271 can't answer the question I built on

I advised: *"don't trust the 271's auth flag — go straight to a 278 inquiry."* Two problems, found later:

1. **HL7 built the entire Da Vinci CRD implementation guide** precisely because eligibility responses don't reliably answer "is prior auth required" per-service, per-payer. If the 271 flag worked, CRD wouldn't need to exist.
2. **Stedi test mode does not support 278 at all.** (Discovered in Round 4 — see below.)

### What survived from Preflight

The **point-of-utterance argument** — the one answer to "doesn't Epic already do this?" that works:

> Epic's check fires at order entry, which in a live visit happens *after* the clinician has already told the patient the plan. There's documented behavioral inertia to following through on something you've said out loud to a patient's face. A sub-10ms on-device check that fires *while the sentence is still being spoken* intercepts **before the verbal commitment exists.**
>
> That's not five minutes earlier. It's **the patient never hears a plan get walked back.**

This survived into Prologue as the reason latency is load-bearing rather than decorative.

---

## Round 3 — the theme reframe

The organizers published their vision: **patient-facing, pre-visit, voice-first.** Preflight was clinician-facing and in-visit — the wrong end of the encounter. Same stack, same FHIR, wrong problem.

### Electron was dropped

Every candidate justification failed:

| Justification | Verdict |
|---|---|
| "It's a kiosk appliance" | Kiosk mode is a **CSS/browser-flag decision**, not an architecture one |
| "Local PHI processing" | **False the moment audio reaches Deepgram.** `safeStorage` is keychain string encryption for local secrets — saying "we process PHI locally" reads as not understanding HIPAA |
| "System audio capture" | **Orphaned by the reframe** — a standalone patient check-in has no second audio source |
| "Clinician cockpit needs a persistent tray app" | The persistent-queue benefit **never appears on stage** — the demo runs one case once |

**Lesson:** a platform preference is not a product justification. When the honest answer to "why does this need to be a desktop app" is weak, changing the answer is cheaper than defending it.

### A related evaluation: an existing codebase

An existing Electron+Python agent (~42k LOC, real SPAV loop, 1,793-line verifier) was evaluated for reuse and **rejected**:
- **Zero healthcare code** — no FHIR, HL7, or RxNorm anywhere
- **No streaming speech at all** — batch STT behind a wake word; the product needs live conversation
- **~8,000 lines of macOS desktop control** the product never calls

*The thing it was good at was the thing the product didn't need.*

---

## Round 4 — Prologue, and what the sponsor docs changed

Full re-derivation against the actual theme produced seven fresh concepts. Two scoring results were worth arguing with rather than accepting:

- **Voice medication reconciliation scored highest on problem severity and clinical credibility — and lost.** Its output is a diff table and it can't motivate a Stedi call. That's a real cost, named rather than hidden. It also turned out to be *contained by* the winner: the lamotrigine catch **is** a medication-history moment.
- **Coverage-prep scored a perfect 10 on Stedi fit and a 3 on voice-native.** That's the signal that eligibility belongs *inside* the winner, not *as* it.

### ⚠️ What reading the sponsor documentation changed

Three findings, one of which killed a plan:

**1. Medplum ships a Stedi integration, dated July 27, 2026** — four days before the event. Maps 270/271 → `CoverageEligibilityRequest`/`Response`, 837P → `Claim` via `$stedi-submit-claim`. **We don't hand-roll the X12↔FHIR mapping.**

**2. ⛔ Stedi test mode does NOT support 278 prior authorization** — or 276/277. Only 270/271, 837, 835, 277CA. **This killed the prior-auth line of thinking entirely.** Any hackathon demo claiming a live 278 is either not using test mode or not telling the truth.

It also *forced* the honest framing we were already moving toward: eligibility is the only real transaction available, and it's the one that can be presented truthfully.

Two more constraints: mock payers are limited to **Aetna, Cigna, UnitedHealthcare, CMS**, and **custom mock data is not supported** — so the synthetic patient must be built around Stedi's fixture, not the reverse. And selecting payer **"Stedi Agent"** returns a documented AAA error 73, which we now use deliberately to demo graceful degradation.

**3. Medplum's own AI doc prescribes our safety model.** It advocates ["can suggest, but not act"](https://www.medplum.com/docs/ai) with AuditEvent logging and AI agents under "the same policy framework as a human user." The review gate isn't our invention — it's the platform's documented architecture.

---

## Reversals, collected

Kept in one place because the pattern matters more than any single item.

| # | I believed | Actually |
|---|---|---|
| 1 | Prior-auth-at-speech is uncommoditized | Cohere+Dragon Copilot and Abridge+Availity both shipped it in the prior 9 months |
| 2 | An audible mid-visit interrupt is the differentiator | Abridge tested interruptive alerts and **deliberately rejected them** for alert fatigue |
| 3 | Skip the 271 flag, fire a 278 | CRD exists *because* the 271 can't answer it — **and test mode doesn't support 278 at all** |
| 4 | Real EDI wins because it's externally verifiable | **Verifiability only counts if a judge verifies it.** A real 271 and a hardcoded string look identical on stage unless realness is made a *demo moment* |
| 5 | Reuse the existing agent codebase | No healthcare code, no streaming speech, ~8k lines of irrelevant desktop control |
| 6 | The demo's A/B latency comparison could be staged | Faking the *villain* in a comparison is worse than faking the hero — it reads as hiding something. Made the slow path a **real** hosted round-trip instead |

**The through-line:** most of these were caught by an adversary whose only job was to kill the idea, or by reading primary documentation instead of trusting memory. Neither is optional.

---

## Principles that emerged

1. **Distinguish reducible from irreducible risk.** More engineering fixes fragile OCR. It does not fix a live phone call over conference wifi.
2. **A real mechanism stretched into a universal claim dies to one question.** "Works with any EHR" killed ShadowSign.
3. **Disclosed limitations read as engineering honesty; discovered ones read as a caught lie.** Preempt the sandbox constraint before a judge probes it.
4. **Where "thin" equals "fake," harden. Elsewhere, stub honestly.** The review gate and the eligibility call are the two places a thin implementation is indistinguishable from a fraudulent one.
5. **Realness must be a demo moment, not a backend property.** Build the EDI request from something the patient said 90 seconds earlier so it demonstrably can't be pre-scripted.
6. **Refusing capability can be the strategy.** The reason nobody occupies this space is liability plus a published accuracy ceiling. Not diagnosing is what makes the position available.
