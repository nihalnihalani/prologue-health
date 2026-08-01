# Running & demoing Prologue

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

**No credentials are required.** With no keys present the app runs on a
deterministic synthetic fixture and every screen labels itself `FIXTURE` rather
than implying a live backend. That is the demo guarantee, not a degraded mode.

```bash
npm test             # 25 tests — clinical rules, engine, safety gate
npm run typecheck    # tsc --noEmit
npm run build        # production build
```

## Going live

Copy `.env.example` to `.env.local` and fill in whichever you have. Each is
independent — Stedi alone will make coverage live while the chart stays fixture.

| Variable | Effect when present |
|---|---|
| `MEDPLUM_CLIENT_ID` + `MEDPLUM_CLIENT_SECRET` | Chart reads hit a real Medplum project; drafts are written as real FHIR |
| `STEDI_API_KEY` | Coverage runs a real X12 270/271; the badge flips `FIXTURE` → `LIVE 270/271` |
| `DEEPGRAM_API_KEY` | `/api/deepgram-token` mints short-lived tokens for the Voice Agent |

⚠️ **Stedi test mode constraints** (verified against their docs): 270/271, 837,
835 and 277CA only — **no 278 prior auth, no 276/277**. Mock payers are limited
to Aetna, Cigna, UnitedHealthcare and CMS, and **custom mock data is not
supported**, so the synthetic patient must be built to match Stedi's fixture
rather than the reverse.

---

## The three minute demo

Open two windows side by side: **`/patient`** on a phone-sized window,
**`/clinician`** on the desktop. The clinician view polls, so the packet fills in
live as the call proceeds.

| Time | Beat | What to do |
|---|---|---|
| **0:00** | Cold open | *"Maria books a routine visit for an itchy rash. All synthetic data. Watch what her intake catches."* |
| **0:20** | Consent | Read one line aloud. Click **That's okay — start**. The recording dot goes live only after consent. |
| **0:35** | Her story | Click **Play Maria's next line**. Point at the call log: `get_relevant_medications · lamotrigine: day 18 of therapy` — **"nobody wrote that question, it came from her chart."** |
| **1:10** | Barge-in | Next line. She cuts the agent off with the sore mouth. `check_red_flags · mucosal-involvement` fires **deterministic, ~0.2 ms**. |
| **1:35** | The moment | Timeline shades the 2–8 week window with the rash marker inside it. Escalation: call today, hold the dose, 911 if worse. **No diagnosis is named.** |
| **2:00** | Coverage | It ran *because* the visit moved up. Point at **"No total cost is estimated"** — a 271 can't price a service that hasn't happened. |
| **2:20** | Reconciliation | Next line. Furosemide: chart active, patient stopped it. `MedicationRequest` vs `MedicationStatement`. |
| **2:40** | Review | Switch to the clinician window. Click a **▶ timestamp** — Maria's own words play. **Reject** one inference. **Approve & sign** → `preliminary → final`. |
| **2:55** | Close | *"Every intake form asks what it knows to ask. Maria didn't know her rash and her prescription were the same story. Prologue did — because it read her chart before it said hello."* |

### The beat that wins it

Open **`/prove`** and hand it over.

- Change the drug to **atorvastatin** — the question disappears and **no inference is recorded**. The system declines to speculate.
- Drag onset past **60 days** — outside the labeled window, nothing fires.
- Switch to **allopurinol** — a different window, and the shaded band moves.

Same engine as the check-in. If you only ever demo Maria, you've demoed a recording.

---

## Fallbacks, in order

The app degrades without ever fabricating. Each level removes capability, never truthfulness.

1. **Deepgram unavailable** → Web Speech API. A real microphone, no credentials. The 🎤 button is live in Chrome.
2. **No microphone / noisy room** → the scripted button. Only Maria's *words* are canned; the chart read, correlation, red-flag evaluation and the agent's question are all still computed.
3. **Medplum unavailable** → synthetic fixture, badged `FIXTURE`.
4. **Stedi unavailable or erroring** → fixture benefits, badged `FIXTURE`, and the agent says the office will check.
5. **Everything down** → the timeline visual still makes the clinical argument.

---

## What is real vs. simulated

Every screen says which. Nothing is implied.

| | Status |
|---|---|
| Chart-conditioned question | **Real, always.** Computed from the record. Never scripted in any mode |
| Temporal correlation & risk windows | **Real.** Hand-curated, cited drug table |
| Red-flag rules | **Real, deterministic, fails closed** |
| Provenance separation & the approval gate | **Real.** `writeDraft()` throws on `status: final` |
| Patient history | Synthetic fixture (live with Medplum keys) |
| Coverage | Fixture (live 270/271 with a Stedi key) |
| Maria's spoken lines in scripted mode | Canned — and labeled as such |

---

## Safety invariants

Two are enforced in code and covered by tests:

```
writeDraft() refuses any resource with status "final" or "completed"
  → tests/clinical.test.ts  "SAFETY: writeDraft refuses a final status"

Composition.status reaches "final" only via the approval handler
  → tests/session.test.ts   "SAFETY: composition is preliminary until approve()"
```

A third is covered behaviourally: no red-flag `patientMessage` may contain a
condition name — asserted against a forbidden-terms regex across every rule.

## Known limitations

- **Not HIPAA compliant, and we don't claim to be.** Synthetic data only.
- The story map is shared between the two views via `localStorage`, so both must
  run in the same browser. A server-side session store is the obvious next step.
- The scripted path advances on a button rather than on real turn-taking.
- Drug knowledge is three entries, hand-curated. It is a demonstration of the
  mechanism, not a formulary.
