# Prologue

Prologue is a chart-aware, voice-first pre-visit intake. A patient describes why they are coming in; the app uses their FHIR chart to ask relevant follow-ups, evaluates a small set of deterministic safety rules, and prepares a provenance-separated draft for clinician review. It is currently a hackathon prototype built around a synthetic patient, not a production clinical system.

## Start here

- `README.md` explains the product, architecture, and safety model.
- `RUNNING.md` is the source of truth for setup, fallbacks, what is real versus simulated, and known limitations.
- `docs/00-DECISION-LOG.md` explains why major product choices were made.
- `docs/01-PRODUCT-DESIGN.md` is the detailed specification; load only the sections relevant to the task.
- `docs/research/` contains deeper evidence for FHIR, market, sponsor, safety, and regulatory work. Re-check primary sources before changing time-sensitive claims.
- The tests are executable safety references. Preserve their intent even when the implementation changes.

## Code map

- `app/patient/page.tsx`: patient intake and voice-mode orchestration.
- `app/clinician/page.tsx`: clinician review and approval UI.
- `app/prove/page.tsx`: interactive proof that chart-conditioned questions are computed, not scripted.
- `lib/session.ts`: shared conversation engine.
- `lib/types.ts`: the single `StoryMap` model used by patient and clinician views.
- `lib/clinical.ts`: deterministic drug-correlation and red-flag logic.
- `lib/medplum.ts` and `lib/stedi.ts`: FHIR and eligibility adapters with explicitly labeled fixture fallbacks.
- `lib/deepgram-live.ts`, `lib/gemini-live.ts`, and `lib/voice.ts`: live and fallback voice paths.

## Product invariants

- The chart-conditioned follow-up is the core product behavior. It must be derived from current chart and conversation data; never replace it with a canned branch.
- Keep patient statements, record facts, payer data, inferences, and clinician decisions structurally separate. Both views must continue to read the same underlying model.
- `lib/clinical.ts` is inspectable deterministic safety logic. Do not introduce an LLM call into its decision path. Evaluation errors escalate rather than silently pass.
- The agent prepares drafts; it does not diagnose, create a `Condition`, independently give treatment advice, or autonomously finalize clinical data.
- The production finalization boundary is the clinician approval handler. `writeDraft()` must continue to reject `final` and `completed`. `PrologueSession.approve()` models the transition for engine tests; do not make it another client-authoritative production path.
- Preserve the distinction between prescribed medication (`MedicationRequest`) and patient-reported use (`MedicationStatement`). Reconciliation must not overwrite either source.
- A 270/271 response supports benefits and coverage status, not a guaranteed price or prior-authorization determination. Never invent missing payer values.
- Degradation removes claims and is visible to the user. A fixture, cached value, or failed integration must never be presented as live data.

## Prototype boundaries to address during product work

- Patient, appointment, clinician, subscriber, and coverage details are currently tied to the Maria Delgado fixture in several runtime paths.
- The server session store is an in-process `Map` with a two-hour TTL and 50-session cap; `localStorage` is a same-browser fallback. Neither is durable or suitable for multiple instances.
- The warmed chart cache is process-local and not patient-keyed.
- Synthetic FHIR dates are generated as date-only UTC strings and later converted back with `Date`; rounding elapsed milliseconds can shift a nominal “22 days ago” value by a day depending on run time and timezone. Keep clinical interval calculations calendar-based and make their tests clock-stable.
- The clinician screen loads the latest session rather than a durable, assigned work queue.
- Approval currently returns a final-looking response while the durable Medplum write remains preliminary. Production work must make the server-authoritative FHIR transition, accepted/rejected item set, `Provenance`, and `AuditEvent` real, atomic or safely retryable, and idempotent.
- Live integration failures currently fall back to clearly labeled fixtures. Keep that useful demo behavior isolated from production configuration, where silent synthetic fallback is unacceptable.
- Drug knowledge contains three hand-curated examples; it is a demonstration mechanism, not a clinical knowledge base.
- Clinician-facing translation, source-linked correction history, durable audio/transcript storage, role-based access, and deployment/compliance controls are not yet complete.

## Working in this repo

Match the surrounding TypeScript, React, and CSS idioms. Prefer an end-to-end vertical slice over disconnected scaffolding. When a change affects clinical behavior, approval, provenance, identity, fallback labeling, or payer interpretation, add tests for the invariant and test the failure path as well as the happy path.

Run before handing off:

```bash
npm test
npm run typecheck
npm run build
```
