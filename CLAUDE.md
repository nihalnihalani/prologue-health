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
- `lib/intake.ts`: server-owned lifecycle, FHIR draft projection, explicit clinician decisions, and finalization transaction.
- `lib/runtime.ts`: demo-versus-pilot behavior and data-origin rules.
- `lib/types.ts`: the single `StoryMap` model used by patient and clinician views.
- `lib/clinical.ts`: deterministic drug-correlation and red-flag logic.
- `lib/medplum.ts` and `lib/stedi.ts`: FHIR and eligibility adapters with explicitly labeled fixture fallbacks.
- `lib/deepgram-live.ts`, `lib/gemini-live.ts`, and `lib/voice.ts`: live and fallback voice paths.
- `tests/adversarial.test.ts`: executable claim audit for the failure modes most likely to destroy clinical trust.

## Product invariants

- The chart-conditioned follow-up is the core product behavior. It must be derived from current chart and conversation data; never replace it with a canned branch.
- Keep patient statements, record facts, payer data, inferences, and clinician decisions structurally separate. Both views must continue to read the same underlying model.
- `lib/clinical.ts` is inspectable deterministic safety logic. Do not introduce an LLM call into its decision path. Evaluation errors escalate rather than silently pass.
- The agent prepares drafts; it does not diagnose, create a `Condition`, independently give treatment advice, or autonomously finalize clinical data.
- The production finalization boundary is the clinician approval handler. `writeDraft()` must continue to reject `final` and `completed`. `PrologueSession.approve()` models the transition for engine tests; do not make it another client-authoritative production path.
- Preserve the distinction between prescribed medication (`MedicationRequest`) and patient-reported use (`MedicationStatement`). Reconciliation must not overwrite either source.
- A 270/271 response supports benefits and coverage status, not a guaranteed price or prior-authorization determination. Never invent missing payer values.
- Degradation removes claims and is visible to the user. A fixture, cached value, or failed integration must never be presented as live data. An empty live chart is empty; a 271 missing a benefit declares it missing. Neither is backfilled from the fixture.
- Every promotable (generated) item requires an explicit clinician approve, edit, or reject. Silence is not consent, and a rejected finding must never become a clinical resource — it stays auditable in the StoryMap and the AuditEvent instead.
- `lib/clinical.ts` red-flag rules are validated for English only (`SAFETY_RULE_LOCALES`). A non-English intake records a visible coverage gap: "not screened" must never be presented as "nothing found". Adding a UI language does not add safety coverage.
- No audio is captured or stored. Any control that plays speech must say it is synthesised from the transcript.

## Prototype boundaries to address during product work

- Patient, appointment, clinician, subscriber, and coverage details are currently tied to the Maria Delgado fixture in several runtime paths.
- The server session store is an in-process `Map` with a two-hour TTL for unsigned sessions and a 200-session soft bound. Signed sessions are retained in-process, but all sessions still disappear on restart and are unsuitable for multiple instances; `localStorage` is only a same-browser fallback.
- The warmed chart cache is patient-keyed but process-local; it is not shared across instances.
- A prior elapsed-milliseconds calculation shifted nominal day intervals across times and timezones. Preserve the calendar-day implementation and its clock-stable boundary tests.
- A queue API exists and orders escalations first, but the clinician screen still opens the latest session instead of presenting the queue with stable detail routes and assignment.
- Approval is server-authoritative and explicit. The receipt now records per-resource `WriteReceipt` entries (`written` / `not-attempted` / `failed`) and never emits a placeholder id as a FHIR resource; `fullyPersisted` and `partial` are derived from attempted-versus-succeeded writes, and an incomplete attestation trail is surfaced as recoverable with a stable `idempotencyKey`. Live persistence itself remains unverified against a real Medplum project.
- Session reads are side-effect free. Claiming a case is an explicit `PATCH /api/session { action: "claim" }`; a `GET` never transitions state.
- Pilot finalization is deliberately unavailable from the browser: the roster is demo-only and the pilot secret is server-side, so the clinician UI disables signing in pilot mode and says why.
- Labeled fixture fallback is permitted in demo mode only. Both the Medplum and Stedi adapters now enforce the pilot-mode prohibition on missing credentials and on request failure, and a non-object HTTP-200 payload is treated as a failure rather than as coverage.
- Drug knowledge contains three hand-curated examples; it is a demonstration mechanism, not a clinical knowledge base.
- Identity is a static server-side roster, not real authentication or Medplum-enforced role separation. Clinician-facing translation, source-linked correction history, durable transcript storage, and deployment/compliance controls are not yet complete. Audio capture is intentionally out of scope, not an implied feature.

## Working in this repo

Match the surrounding TypeScript, React, and CSS idioms. Prefer an end-to-end vertical slice over disconnected scaffolding. When a change affects clinical behavior, approval, provenance, identity, fallback labeling, or payer interpretation, add tests for the invariant and test the failure path as well as the happy path.

Run before handing off:

```bash
npm test
npm run typecheck
npm run build
```
