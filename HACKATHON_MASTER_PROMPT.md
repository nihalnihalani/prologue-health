# Prologue — Claude 5 master execution prompt

Run this prompt with Claude Code from the repository root. It is intentionally task-specific. Durable project facts and safety invariants live in `CLAUDE.md`; evaluation taste lives in `docs/HACKATHON-RUBRIC.md`; detailed product reasoning remains in the existing design and research documents.

Focused fresh-context reviews for trust, judge behavior, sponsor proof, rehearsal, and product positioning live in `HACKATHON_PROMPT_PACK.md`. They are checkpoints, not extra implementation scope.

---

You are the product lead, senior engineer, clinical-safety reviewer, and demo director for Prologue.

Your objective is to turn the current trusted prototype into the strongest possible YC × Medplum Agentic Healthcare Hackathon submission. Improve the working product, not merely its plan or presentation. Optimize for one visible, defensible transformation:

> A routine pre-visit intake asks a question that only this patient's chart makes possible, detects a deterministic safety concern, creates a same-day clinical workflow, preserves human authority, and gives both sides an auditable outcome.

Do not maximize feature count. Make the central mechanism undeniable, operational, and stage-reliable.

## Context contract

Read `CLAUDE.md` completely first. Treat it as durable repository guidance, especially its product invariants and prototype boundaries.

Then load context progressively:

1. Read `docs/HACKATHON-RUBRIC.md` before choosing scope or judging completion.
2. Read `RUNNING.md` for current runtime modes, integration boundaries, safety coverage, known limitations, and demo behavior.
3. Inspect the current implementation and tests before relying on `README.md` or an aspirational design claim.
4. For the mandatory slice, inspect only the relevant entry points and their dependencies: `app/page.tsx`, `app/prove/page.tsx`, `app/patient/page.tsx`, `app/clinician/page.tsx`, `app/api/session/route.ts`, `app/api/approve/route.ts`, `lib/session.ts`, `lib/store.ts`, `lib/intake.ts`, `lib/types.ts`, and the affected tests.
5. Load `lib/medplum.ts`, `lib/stedi.ts`, `lib/deepgram-live.ts`, or `lib/gemini-live.ts` only when the selected extension touches that integration.
6. Use the relevant section of `docs/01-PRODUCT-DESIGN.md` or `docs/research/` when changing a clinical, FHIR, payer, regulatory, market, or sponsor claim. Re-verify time-sensitive integration and regulatory claims against current primary documentation.
7. Treat `docs/archive/` as historical reasoning, not current requirements.

Avoid repeating repository facts in new documents. Update the closest existing source of truth when implementation makes it inaccurate.

## Current baseline — verify, then build forward

The repository has already completed a server-authority phase and an adversarial trust audit. Confirm these behaviors in code and tests rather than rebuilding them:

- patient-keyed intake sessions with explicit lifecycle states;
- server-authoritative finalization and terminal signed sessions;
- explicit clinician approve/edit/reject decisions for every promotable generated item;
- rejected findings remain auditable but do not become promoted clinical resources;
- preliminary FHIR draft projection without agent-created `Condition` resources;
- `Composition` finalization plus `Provenance` and `AuditEvent` receipt data;
- a demo-versus-pilot runtime contract, while adapter-by-adapter enforcement still requires audit;
- patient-keyed chart cache and honest empty live charts;
- honest sparse 271 parsing without fixture money in a live response;
- negation and historical-symptom suppression for English deterministic safety rules;
- explicit labeling that non-English safety coverage is not yet implemented;
- explicit labeling that transcript playback is synthesized and not recorded audio;
- an urgency-sorted queue API;
- an existing `/prove` counterfactual page using the same conversation engine.

If any baseline statement is false at the current revision, record the evidence, repair or relabel it before proceeding, and update the relevant test. Do not silently assume the prompt is newer than the code.

## Required preflight

Before editing:

1. Inspect repository status and preserve user changes and generated artifacts that are outside the task.
2. Run the existing tests to establish a baseline. Distinguish pre-existing failures from regressions.
3. Produce a compact claim table with four columns: `claim`, `implementation evidence`, `demo evidence`, `status`. Use `implemented`, `partial`, `aspirational`, or `contradicted` as status values.
4. Score the current product with `docs/HACKATHON-RUBRIC.md`.
5. Propose the smallest implementation sequence that completes the mandatory slice below. Explain any reorder using evidence from the code or rubric.

Keep the preflight concise. Do not stop after planning; begin implementation in the same run.

At the audited post-trust revision, the suite contained 88 passing tests. Treat that number as historical evidence, not a substitute for running the current suite.

Rank proposed work using `judge impact × product value × feasibility`, then discount it for `clinical risk × demo fragility`. The sequence below is the default because it connects existing capabilities into one story. Change the ordering only when code evidence shows that another order reduces risk or produces a more coherent vertical slice.

## Mandatory slice

Complete these milestones in dependency order. Prefer exposing and connecting capabilities that already exist over introducing new infrastructure.

### Milestone 0 — Close the remaining trust gaps

Do this before adding visible “wow” features. The current trust audit established the right architecture but left several implementation gaps that can invalidate a demo claim.

Establish and test these outcomes:

- In pilot mode, missing credentials, a rejected request, a timeout, or malformed Stedi data surfaces as an integration failure. It never returns the synthetic eligibility fixture. The API and UI report the origin of the actual result, not the origin implied by configuration.
- Session reads are side-effect free. Opening or polling `GET /api/session?id=…` does not claim the session or change `ready_for_review` to `under_review`; a deliberate clinician action owns that transition.
- Pilot finalization has a usable server-verified identity path. Never expose a shared environment secret to browser code. If real authentication cannot be completed, make pilot finalization visibly unavailable and keep roster-based authorization explicitly demo-only.
- A signature or receipt never says `Provenance`, `AuditEvent`, `Task`, or another resource was written unless that specific write succeeded. Preserve per-resource origin and status.
- A failure after one or more external writes does not become an apparently complete signed session. Make partial success inspectable and safely retryable, or fail before claiming finality. Do not let a retry create an unbounded set of duplicate resources.

Acceptance:

- focused tests cover pilot mode with missing and failing Stedi, read-only GET behavior, explicit review transition, unauthorized pilot finalization, each auxiliary-write failure, partial success, and retry;
- the clinician UI contains no unconditional “written” claim;
- every failure leaves a truthful canonical state from which an operator can understand the next action;
- the full pre-existing suite still passes before Milestone 1 begins.

### Milestone 1 — Make the proof the front door

Turn `/prove` into a judge-controlled “Challenge Prologue” experience and link it prominently from the homepage.

A judge with no instructions should be able to select three one-click presets:

1. a relevant medication and onset inside its cited window;
2. the same medication outside the window;
3. an unrelated medication for which Prologue declines to infer.

The page must show, in a stage-readable sequence:

- the synthetic chart facts used;
- the patient statement;
- the next question generated by the production conversation engine;
- whether a deterministic correlation fired or declined;
- the rule identifier and facts it evaluated;
- the source citation when one exists;
- the inference recorded, or an explicit statement that none was recorded;
- the preliminary FHIR resources the result would propose.

Changing a fact must recompute the result through the same `PrologueSession` and clinical functions used by intake. Do not create a second rules engine, hard-code the displayed outcome, or add an uncited drug rule merely to make a preset work.

Acceptance:

- positive, negative, boundary, and unrelated-drug cases have tests;
- reset returns to a known synthetic baseline;
- the interaction can be demonstrated in 30 seconds;
- fixture labeling remains visible;
- “no inference” is treated as a successful calibrated outcome.

### Milestone 2 — Turn the queue API into a clinician workflow

Replace the clinician page's implicit “latest session” behavior with an actual work queue and stable session selection.

The queue should make the clinical outcome visible without opening every packet:

- patient and appointment context;
- urgency and escalation reason;
- lifecycle state;
- language and safety-coverage state;
- assignment when present;
- elapsed time since escalation or readiness;
- signed status and reviewer when complete.

Escalated unsigned sessions sort first. Selecting a row opens that session by stable ID. A separate explicit open/claim action transitions `ready_for_review` to `under_review` through canonical server state; all reads remain side-effect free. Refreshing, polling, or opening another browser must not silently switch the selected session to whichever session was updated most recently.

Add a compact workflow rail to the selected packet:

`appointment → consent → intake → escalation/ready → under review → signed`

Create the requested urgent `Task` when the escalation enters the queue, not for the first time during signature. Move it to in-progress only after an explicit claim and to completed only after the corresponding clinical workflow event. Show its priority, status, identifier, assignee, and acknowledgement state. Do not say the clinic received, accepted, or acted on an escalation unless canonical state records that event.

Acceptance:

- queue ordering, stable selection, lifecycle transitions, empty queue, signed sessions, and concurrent updates are tested;
- Task creation, claim, completion, replay, and failure states are tested;
- the patient and clinician views cannot accidentally cross session or patient context;
- the queue remains usable on the laptop while intake runs on a phone;
- polling or failure fallback is honest and does not overwrite a signed canonical record.

### Milestone 3 — Make clinician authority inspectable

Keep every promotable generated item initially undecided. Preserve explicit approve/edit/reject behavior and make the pending state obvious.

Before signing, provide a FHIR diff preview derived from the canonical session and current decisions. For each proposed resource, show:

- resource type and status;
- source item and provenance class;
- clinician decision that permits or blocks it;
- edited clinician wording and preserved original when applicable;
- live, fixture, or not-yet-persisted origin.

Signing must reload canonical server state, validate decisions against the current review version, and refuse stale or incomplete reviews. Rejected and undecided generated findings never enter promoted resources.

After a successful signature, show a compact receipt using actual server results:

- accepted, edited, and rejected counts;
- `Composition` preliminary-to-final transition;
- clinician identity and signed time;
- Composition, Provenance, AuditEvent, and Task identifiers when they exist;
- live or fixture persistence;
- replay/idempotency status;
- warnings or incomplete external writes.

Never render a local placeholder ID as a live FHIR resource. If multi-resource persistence partially succeeds, do not claim atomic success; make the state recoverable or visibly incomplete and test replay behavior.

Acceptance:

- incomplete, unknown, duplicate, stale, edited, rejected, unauthorized, replay, integration-failure, and successful decision sets are tested;
- the UI cannot construct finality locally;
- the receipt survives reload from canonical state;
- every receipt statement is traceable to returned server data.

### Milestone 4 — Close the patient loop truthfully

After handoff, let the patient view observe canonical workflow state for its own session.

Use distinct plain-language states such as:

- sent to the care team;
- being reviewed;
- reviewed by the named clinician;
- clinic acknowledged the urgent Task;
- follow-up action recorded.

Only show a state when its server-side event exists. “Reviewed” does not mean “the clinic called,” and Task creation does not mean acknowledgement. Preserve the product boundary: the agent does not diagnose, prescribe, stop medication, guarantee price, or independently decide disposition.

Acceptance:

- no premature acknowledgement;
- no cross-session status leak;
- terminal signed state cannot be changed by a stale patient tab;
- failure and fixture states are visible;
- patient wording is tested against forbidden diagnostic, treatment, and guarantee language.

## Select exactly one signature extension

After the mandatory slice passes twice end to end, score these extensions with the rubric and implement at most one. Prefer the smallest option that creates visible sponsor-native proof under the credentials and time actually available. If none raises the evidence-backed score without putting the golden path at risk, implement none.

### Option A — Medplum-enforced authority boundary

Use distinct agent and clinician Medplum identities and AccessPolicies so the platform, not merely application code, prevents the agent from writing final or completed clinical states.

Provide environment-parameterized setup artifacts and a safe “prove the boundary” demonstration:

1. the agent attempts a harmless finalization;
2. the real Medplum `403`/`OperationOutcome` is displayed;
3. the authorized clinician performs the transition;
4. the resulting resource identifiers appear in the receipt.

Do not claim this enforcement in fixture mode or without successfully verifying the policies against a live project.

### Option B — Cross-sponsor trace rail

Carry a correlation ID from the voice turn through function execution, chart retrieval, eligibility, clinician decision, and FHIR persistence.

Expose existing Deepgram/Gemini events and measured latency, Stedi trace or error identifiers when returned, and Medplum resource IDs. Preserve `live`, `fixture`, `cache`, `failed`, and `unknown` as distinct states. Do not infer a missing payer value or call an HTTP success “active coverage.” Keep detailed payloads behind a drawer so the main story remains legible.

### Option C — Opt-in Gemini visual medication reconciliation

Only choose this if the mandatory flow is stable and enough time remains for failure testing.

After explicit camera consent, accept low-rate video of a synthetic medication label. Limit the model tool output to visible label text, strength, dosage form, and extraction confidence. Deterministically compare it with the warmed chart, ask the patient to confirm, then create a preliminary medication discrepancy. Do not diagnose from an image, infer adherence, retain frames by default, or write before confirmation. Provide camera-off and text fallbacks.

## UX and demo constraints

Use the existing visual language unless a targeted change materially improves legibility. Do not spend the run on a wholesale redesign.

The primary demo must fit in four minutes:

1. Open with the consequence: Maria's routine Thursday appointment should not wait.
2. Show one patient statement and the chart-conditioned question.
3. Show the deterministic safety signal and timeline.
4. Show the case at the top of the clinician queue.
5. Make explicit decisions, sign, and reveal the receipt.
6. Show the patient-side reviewed state.
7. End with one `/prove` negative control or judge-changed fact.

Move medication reconciliation depth, doorknob questions, broad multilingual coverage, and internal architecture to Q&A unless they are essential to the chosen extension.

Provide a one-click demo reset that clears only synthetic demo sessions and returns every screen to a known state. Do not create a destructive production reset path.

Important UI text must be readable from the back of a room. Keep debug detail inspectable but collapsed by default. The product story should remain understandable without reading raw FHIR or source code.

## Product and YC framing

Anchor the initial wedge in pre-visit readiness for outpatient visits involving recent medication changes. Treat this as a hypothesis to validate, not a permanent market constraint.

Before closing the run, define:

- the initial patient and clinic segment;
- the buyer, daily user, and workflow owner;
- what existing form, call, or chart-review work changes;
- the measurable first outcome;
- the riskiest adoption assumption;
- a small pilot design;
- target metrics and guardrails, clearly separated from achieved prototype results.

Useful pilot measures include completion rate, clinician review time, inference acceptance/edit/rejection, medication discrepancies surfaced, appropriate escalation acknowledgement time, false-positive escalation rate, abandonment, and parity by language or ASR-confidence band. Never present synthetic runs as evidence of clinical outcome improvement.

## Verification

Verification depth should match clinical and demo risk. At minimum:

1. Run the full test suite.
2. Run TypeScript checking and the production build.
3. Exercise the three `/prove` presets.
4. Exercise queue selection and approval across two browser contexts.
5. Test a rejected inference, an incomplete review, stale state, an integration failure, and an idempotent replay.
6. Confirm every live/fixture/cache/failed label against its underlying result.
7. Rehearse the primary demo until it passes three consecutive times, including a two-device run and one run with network integrations unavailable.
8. Re-score the result with `docs/HACKATHON-RUBRIC.md`. Report before and after scores with evidence; do not inflate them.

If credentials prevent a live sponsor check, finish all deterministic and fixture verification, keep the UI honest, and list the exact live steps still unverified. Lack of credentials is not permission to fake a successful integration.

After each milestone, update a compact ledger containing `claim`, `evidence`, `origin`, `test`, and `remaining risk`. Do not start the next milestone if a trust invariant regressed. Screenshots, actual resource identifiers, provider errors, test output, and repeatable judge interactions are stronger evidence than additional explanatory prose.

## Scope and stop conditions

Do not broaden scope into general diagnosis, individualized treatment, a complete drug knowledge base, full HIPAA/compliance claims, enterprise SSO, full multi-tenancy, image diagnosis, prior authorization, or guaranteed cost estimation.

Keep patient notifications, durable audio, multilingual safety expansion, more drug rules, broad camera input, full SSO, and multi-instance persistence out of the hackathon core. A truthful negative control and a complete clinical workflow are more valuable than one more shallow feature.

Cut work in this order if time or reliability becomes constrained:

1. optional signature extension;
2. patient acknowledgement beyond the reviewed state;
3. receipt animation and visual polish;
4. nonessential queue metadata.

Do not cut:

- the production-engine counterfactual proof;
- the chart-conditioned question;
- deterministic safety behavior and honest coverage gaps;
- provenance separation;
- explicit human decisions;
- server-authoritative finalization;
- live/fixture honesty;
- a reliable reset and fallback.

If a requested visual claim cannot be implemented truthfully, relabel or remove it. If a sponsor feature cannot be verified, preserve a clearly labeled fixture and move the claim to “next step.” Use judgment within these boundaries and continue without asking for routine implementation choices.

Freeze new feature work immediately after the mandatory story completes three consecutive clean rehearsals. From that point, only fix regressions, improve stage legibility, tighten the script, or add the one selected extension when its proof is already available. Do not destabilize a winning core to fill unused time.

If subagents are available, use them for bounded independent work such as claim auditing, adversarial test design, accessibility review, and final rubric verification. Keep one owner responsible for integrating the vertical slice so parallel work does not create competing state models or duplicate engines.

## Final handoff

Finish with:

1. the outcome and why this was the highest-scoring slice;
2. files and behavior changed;
3. architecture and state-flow summary;
4. test, typecheck, build, two-browser, and rehearsal results;
5. what is live, fixture, simulated, cached, failed, or unverified;
6. before-and-after rubric scores with evidence;
7. exact four-minute script and backup script;
8. remaining credibility risks;
9. the next three product bets ranked by customer value, judge value, clinical risk, and engineering risk.

Do not stop at a report while a safe, high-value implementation step remains. Leave the repository in a demonstrable state.
