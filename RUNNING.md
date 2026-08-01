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
| `PROLOGUE_MODE` | `demo` (default) permits labeled fixtures. **`pilot` refuses to substitute synthetic clinical or payer data** and surfaces the failure instead |
| `PROLOGUE_CLINICIAN_SECRET` | Required in pilot mode. A browser alone cannot finalize clinical data |
| `DEEPGRAM_API_KEY` | **Deepgram Voice Agent becomes the English path** — `nova-3-medical` + keyterm prompting over the patient's own drug list |
| `GEMINI_API_KEY` | **Gemini Live becomes the non-English path** — native audio detects and switches language automatically |

⚠️ **Stedi test mode constraints** (verified against their docs): 270/271, 837,
835 and 277CA only — **no 278 prior auth, no 276/277**. Mock payers are limited
to Aetna, Cigna, UnitedHealthcare and CMS, and **custom mock data is not
supported**, so the synthetic patient must be built to match Stedi's fixture
rather than the reverse.

---

## The three minute demo

**Use two devices.** Open **`/patient`** on an actual phone and **`/clinician`** on
the laptop, both pointed at the same server. The story map is held server-side,
so the packet fills in on the laptop as the call proceeds on the phone. (Two
browser windows on one machine works too, but the two-device version is the
demo that lands.)

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

## Languages

Ten languages, selectable before consent: English, Español, 中文, Tiếng Việt, हिन्दी, العربية (RTL), Tagalog, Português, Русский, Français.

**The rule, and it is the whole design:**

> The **patient** hears and reads their own language.
> The **clinical record** is always English.
> The patient's **original words** are preserved verbatim and are one click away from the clinician.

A translated summary is an interpretation. The clinician must be able to reach what was actually said — so the original is never discarded, and the clinician is never shown a translation without a path back to the source.

Gemini Live's native-audio models **choose the language themselves and reject an explicit language code**, so language is steered in the system instruction — and the model will follow the patient if they switch mid-call.

## Voice routing — and why

Two providers, chosen per language rather than as a preference:

| Language | Provider | Why |
|---|---|---|
| **English** | **Deepgram Voice Agent** — `nova-3-medical` + `keyterms` | The largest live risk in this demo is a drug name transcribing wrong. *Metoprolol* and *metolazone* differ by one phoneme and are unrelated drugs; *lamotrigine* is the word the whole demo turns on. Keyterm prompting over a **closed vocabulary — this patient's own eight medications** — is the strongest mitigation anywhere in the stack. |
| **Everything else** | **Gemini Live** — `gemini-3.1-flash-live-preview` | Native-audio models detect and switch language automatically and reject an explicit language code. Deepgram would need the language declared up front; Gemini follows the patient if they switch mid-call. |

**The detail worth pointing at on stage:** when a deterministic red-flag rule fires, the app calls Deepgram's `InjectAgentMessage` with `behavior: "interrupt"` — the safety rules cut the model off mid-word rather than *asking* it to comply. Safety logic outranks the model, and it is enforced on the wire.

Deepgram also reports **real latency on the wire** (`LatencyReport`, `AgentStartedSpeaking`), so the turn/STT/TTS figures shown in the header are measured, not estimated.

## Fallbacks, in order

The app degrades without ever fabricating. Each level removes capability, never truthfulness.

1. **Deepgram unavailable** (no key, or the token mint 503s) → English falls through to the next level. The 503 in the console is the capability probe working.
2. **Gemini unavailable** → non-English falls through too.
3. **Neither** → Web Speech API. A real microphone, no credentials. The 🎤 button is live in Chrome.
4. **No microphone / noisy room** → the scripted button. Only Maria's *words* are canned; the chart read, correlation, red-flag evaluation and the agent's question are all still computed.
5. **Medplum unavailable** → synthetic fixture, badged `FIXTURE`.
6. **Stedi unavailable or erroring** → fixture benefits, badged `FIXTURE`, and the agent says the office will check.
7. **Everything down** → the timeline visual still makes the clinical argument.

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
| Deterministic safety coverage | **English only.** Other locales are flagged unscreened |
| Patient audio | **Never recorded.** The clinician view synthesises speech from the transcript |

---

## Safety invariants

Enforced in code and covered by tests in `tests/intake.test.ts` unless noted:

```
writeDraft() refuses status "final" or "completed"        tests/clinical.test.ts
Clinical finality is server-side only — a client-supplied compositionStatus,
  approvedBy or approvedAt is discarded on ingest
The clinician is authorised against a roster before any write; pilot mode
  additionally requires PROLOGUE_CLINICIAN_SECRET
Rejected item ids are validated against the canonical server item set
Approval is idempotent — replay returns the original signature
A signed session is terminal; later client writes are ignored, not applied
Drafts never include a Condition — only a clinician may assert one
Pilot mode refuses to sign against a fixture and leaves the session unsigned
Day-of-therapy is calendar-based, so a clinical interval cannot shift with
  the time of day
```

Added by the trust audit (`tests/adversarial.test.ts`):

```
Rejected findings never become DetectedIssue or any clinical resource; they
  stay auditable in the StoryMap and the AuditEvent
Every promotable item needs an EXPLICIT approve / edit / reject; an unread or
  partially reviewed packet is refused (422) rather than promoting itself
An edit promotes the CLINICIAN's wording; the pre-edit text is preserved
Negated and historical symptoms do not escalate ("not sore", "denies",
  "last year") while a real report in a mixed sentence still does
Safety rules are validated for ENGLISH ONLY. A non-English intake records a
  visible coverage gap for the clinician — "not screened" is not "nothing found"
An empty live chart is reported as EMPTY, never backfilled from the fixture
A live 271 missing benefits declares them missing, never backfilled with
  fixture money
No shipped string in any locale gives medication advice
The pilot secret is never referenced from client code
```

Also covered behaviourally: no red-flag `patientMessage` may contain a condition
name, asserted against a forbidden-terms regex across every rule and locale.

## Known claim boundaries

- **Safety rules are English-only.** Ten UI languages does not mean ten languages
  of safety coverage. A non-English intake is flagged as unscreened rather than
  passing silently. Adding a language to the UI does **not** add safety coverage;
  only writing and testing rules does.
- **No audio is recorded or stored.** The clinician "read aloud" control uses the
  browser speech synthesiser on the stored transcript. It previously said "hear
  what the patient said", which implied a recording that does not exist.

## Known limitations

- **Not HIPAA compliant, and we don't claim to be.** Synthetic data only.
- The session store is an **in-process Map**. It is now patient-keyed, holds an
  explicit lifecycle, and is the canonical source the approval transaction
  reloads — but it still does not survive a restart or span multiple serverless
  instances. Durable persistence is Phase 2; the store interface is narrow so
  swapping the backend will not touch the transaction logic.
- **Identity is a static roster**, not real authentication. It exists so that
  finalization has a server-side authorisation gate at all and so the attester
  recorded on the `Provenance` comes from the server rather than a client
  display string. SSO/RBAC is Phase 3 and is required before real PHI.
- **The durable FHIR write is unverified against a live Medplum project.** With
  no credentials the transaction runs, labels itself `origin: "fixture"`, warns
  that the record is not live, and (in pilot mode) refuses outright.
- **Clinician-facing translation is not implemented.** When a patient speaks
  Spanish, the clinician sees the original Spanish tagged `original · es-US`,
  not an English rendering. Showing a machine translation *as* the clinical
  record without a path back to the source would be worse than showing the
  source, so the original is what we show.
- The scripted path advances on a button rather than on real turn-taking.
- Drug knowledge is three entries, hand-curated. It is a demonstration of the
  mechanism, not a formulary.
