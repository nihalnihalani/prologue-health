# Prologue — production integration master prompt

Run this prompt with Claude Code from the repository root. It is an implementation prompt, not a planning exercise. It replaces the older first-phase productization checklist.

The prompt is deliberately organized around outcomes, interfaces, and verification gates. Durable repository invariants remain in `CLAUDE.md`; detailed product history remains in the existing docs; provider-specific facts must be reloaded from primary sources when the relevant integration is being changed.

---

You are the product lead, principal engineer, security engineer, clinical-safety reviewer, and release owner for Prologue.

Your objective is to turn the current synthetic-patient hackathon prototype into a deployable outpatient-clinic product with real patient/appointment selection, durable multi-user workflow, live chart retrieval, production voice, a governed LLM layer, and Moss-backed low-latency retrieval.

Do the implementation in this repository. Do not stop after producing an assessment, architecture diagram, scaffolding, TODOs, or a list of suggested changes. Continue through migration, integration, failure handling, tests, live smoke checks when credentials exist, and an evidence-backed release decision.

The product outcome is:

> An authenticated patient starts intake for a real scheduled appointment; Prologue retrieves only that patient's authorized chart context, conducts a live Deepgram conversation, uses a governed LLM to extract and phrase draft information, runs deterministic clinical safety logic independently of the model, creates a durable clinician workflow, and allows an authorized clinician to approve, edit, or reject every generated item before any clinical finalization. Every source, provider call, failure, decision, and write is traceable.

“Production-ready” does not mean claiming that deployment, licensing, a BAA, or a live provider was verified when it was not. It means the code has a real production path, production cannot fall back to fixtures, operational and security controls exist, and every external prerequisite is either proven with evidence or blocks the release explicitly.

## Context contract

Read `CLAUDE.md` completely first. Preserve its product invariants and treat its prototype boundaries as a starting audit list.

Then load context progressively:

1. Read `RUNNING.md` to learn the current runtime modes and real-versus-simulated boundaries.
2. Inspect `package.json`, `.env.example`, the current git status, and all source and test files that participate in patient intake, voice, retrieval, sessions, approval, Medplum, and Stedi.
3. Treat the implementation and executable tests as stronger evidence than `README.md` or design documents.
4. Read only the relevant sections of `docs/01-PRODUCT-DESIGN.md` and `docs/research/` when changing FHIR, safety, payer, voice, or product claims.
5. Treat `docs/archive/` as history, except for its Moss product intent. Do not restore superseded clinical or demo behavior from it.
6. Before coding against Moss, Deepgram, an LLM provider, Medplum, or Stedi, consult the current primary documentation, installed package declarations, current package license, and exact version selected. Record the date and source URL in the integration evidence ledger.

Keep context focused while working. Do not create a second source of truth that repeats the repository. Update the closest existing documentation only when code makes it inaccurate.

## Current baseline to verify

At prompt-authoring time, the repository had 96 passing tests, passed `npm run typecheck`, and completed `npm run build`. Treat those results as historical evidence and run the current revision yourself.

The current code appears to include these valuable foundations. Verify each before relying on it:

- one `StoryMap` model shared by patient and clinician views;
- deterministic English red-flag and temporal-correlation logic in `lib/clinical.ts`;
- provenance-separated patient, record, inference, insurance, and clinician facts;
- a server-side approval endpoint with explicit decisions and a finalization guard;
- preliminary FHIR projections that do not let the agent create a `Condition`;
- a patient-keyed but process-local session store;
- a Medplum adapter, direct Stedi adapter, Deepgram Voice Agent client, and Gemini Live client;
- demo and pilot runtime concepts;
- adversarial tests for rejection, missing payer fields, unsupported-language safety coverage, and client-supplied finality.

The current revision also appears to have serious product gaps. Confirm, refine, and repair them rather than blindly following this list:

- `@inferedge/moss` is not installed and no Moss retrieval path exists;
- the Deepgram Voice Agent has a managed `gpt-4o-mini` think stage while `PrologueSession` independently computes another reply, creating two potential conversation authorities;
- real voice transcripts do not drive the same complete reconciliation, doorknob, completion, and handoff behavior as the scripted branch;
- LLM output is not a server-owned, schema-validated, auditable clinical draft pipeline;
- patient identity, appointment details, chart lookup, eligibility input, and parts of the session engine are tied to Maria Delgado or the fixture;
- `POST /api/session` accepts a client-supplied clinical map rather than rebuilding canonical state from authorized server events;
- the session store and warmed chart cache are in-memory and unsuitable for restarts or multiple instances;
- API routes lack real authentication, tenant scoping, role enforcement, robust input schemas, and rate limits;
- the clinician screen renders placeholder queue patients and loads the latest session instead of consuming the real queue with stable routes and explicit claim actions;
- patient and payer fixture fallbacks are still part of normal demo execution;
- idempotency and partial-write recovery are process-local and do not prevent duplicate external resources across a crash;
- external provider calls lack one end-to-end trace, durable event history, consistent origin propagation, and operator recovery workflows;
- current docs contain aspirational claims that the code does not satisfy.

## Required preflight

Before editing:

1. Inspect the worktree and preserve user changes. Do not overwrite unrelated modifications in `lib/deepgram-live.ts`, `tests/voice-routing.test.ts`, or any other dirty file.
2. Run the test suite, typecheck, and build. Separate pre-existing failures from regressions.
3. Produce a compact evidence table with: `capability`, `current code evidence`, `runtime evidence`, `status`, and `production gap`.
4. Trace one current patient utterance from microphone/transcript through the engine, safety logic, session persistence, clinician decision, and FHIR receipt. Identify every client-authoritative boundary and every place two components can disagree.
5. Inventory every fixture, hard-coded person, mock queue row, static roster entry, demo-only delay, synthetic identifier, and fallback. Classify it as test-only, local-development-only, or prohibited in production.
6. Inspect provider terms and data-handling requirements. In particular, verify Moss production/commercial licensing and whether any cloud index, embedding, telemetry, or model asset flow can contain PHI. Verify the clinic's Deepgram and chosen LLM agreements/BAAs before declaring real-PHI readiness.
7. Present a phased implementation sequence based on dependency order, then continue into implementation in the same run.

Do not ask for routine implementation choices that can be determined from the code. Ask only if a missing business decision would materially change authorization, data handling, vendor selection, or destructive migration scope.

## Product invariants

Preserve these throughout the migration:

- The chart-conditioned follow-up is computed from the authorized patient's current chart and current conversation. It is never a canned branch or a separate demo engine.
- Patient statements, chart facts, retrieved evidence, LLM extractions, deterministic inferences, payer data, and clinician decisions remain structurally distinct.
- Deterministic safety rules run on every committed clinical turn and fail closed. An LLM may extract candidate facts or phrase a question; it never owns red-flag truth, disposition, medication advice, or finality.
- Unsupported-language safety coverage is labeled “not screened,” never “nothing found.”
- The patient never receives a diagnosis, individualized treatment recommendation, medication-start/stop instruction, guaranteed cost, or unsupported prior-authorization statement.
- A 271 contributes benefits and coverage facts only. Missing fields remain missing.
- No browser, voice provider, LLM, fixture, or unauthenticated API can make a clinical resource final.
- Every generated promotable item requires an explicit clinician approve, edit, or reject decision. Silence is not consent.
- Rejected or undecided generated content never becomes a promoted clinical resource.
- `MedicationRequest` and `MedicationStatement` remain distinct.
- Production never substitutes fixture, seed, cached-other-patient, or mock payer data after an integration failure.
- An empty real chart is empty. An unavailable integration is unavailable. Neither is backfilled.
- Reads do not mutate workflow state. Claim, release, acknowledge, sign, and retry are explicit commands.
- No secret, Moss project key, Medplum client secret, Stedi key, LLM key, or raw Deepgram API key reaches the browser.
- Logs, traces, analytics, and error reports do not contain raw PHI by default.

## Target architecture

Keep Next.js and Medplum unless evidence shows a change is necessary. Introduce narrow interfaces so production providers can be tested and replaced without branching the clinical engine.

### Canonical server-owned turn pipeline

There must be one authoritative turn pipeline:

`authenticated session → final patient transcript → persist immutable turn → structured LLM extraction → deterministic safety evaluation → authorized chart retrieval → question policy → exact next-turn plan → voice rendering → persist provider events and updated draft`

The browser may capture/play audio and render state. It may not submit a replacement `StoryMap`, invent patient context, or declare a clinical result. Replace client map upserts with typed commands/events and server responses. Rebuild the canonical view from durable server state.

Eliminate the present dual-brain behavior. Select and document one turn owner:

- either Deepgram Voice Agent is the conversational transport and must call a canonical server turn tool whose returned action controls the spoken result;
- or Deepgram supplies streaming STT/TTS while a server-side orchestrator and selected LLM own the turn.

Do not leave independent Deepgram and `PrologueSession` replies that can diverge. Safety interrupts must be able to override speech immediately in either design.

### Required provider interfaces

Design these contracts before concrete integrations:

- `SessionRepository`: create, read, append turn, optimistic version update, claim/release, decision, finalize, retry, abandon, list queue, and audit history.
- `ChartRepository`: authorized patient/appointment resolution, chart fetch by resource version, and FHIR write/finalize with conditional/idempotent semantics.
- `RetrievalProvider`: index/update/delete patient-scoped documents, warm an index, query with mandatory tenant and patient scope, return ranked facts with stable FHIR references, scores, index version, origin, and measured latency.
- `VoiceTransport`: connection lifecycle, final/interim transcript events, agent transcript, tool events, interruptions, reconnect/session resume, latency, and terminal errors.
- `ClinicalLanguageModel`: structured turn extraction, constrained question phrasing, evidence-bound draft summary, refusal/abstention, usage, model version, and provider trace ID.
- `EligibilityProvider`: submit the actual authorized subscriber/coverage context and return sparse benefits with raw origin and trace identifiers.
- `IntegrationResult<T>`: value, origin (`live`, `cache`, `fixture`, `failed`, `unknown`), provider, started/ended time, trace ID, model/index version, retryability, and sanitized error.

Provider interfaces are not permission to build disconnected scaffolding. Wire each interface through one complete real vertical slice before generalizing further.

## Durable product control plane

Replace the in-process map with a durable transactional store suitable for multiple app instances. A relational database is the default unless repository evidence supports another choice. Add migrations and a repository boundary.

Persist at least:

- tenant/clinic scope and authenticated actor references;
- patient and appointment references, without duplicating the complete FHIR chart;
- intake session, lifecycle, locale, consent version, creation/update/completion times, current version, assignment, and terminal state;
- immutable patient and agent turns with sequence numbers and provider event IDs;
- extracted candidate facts and their exact source transcript spans;
- retrieved chart facts and FHIR resource/version references;
- deterministic rule evaluations, including negative/coverage outcomes;
- clinician decisions, edits, original text, actor, time, and review version;
- integration calls and origin/trace/status metadata;
- outbox/retry records for Task creation and FHIR writes;
- durable idempotency keys and per-resource receipts;
- security/audit events.

Use database transactions, unique constraints, optimistic concurrency, and an outbox or equivalent pattern so crashes cannot create a falsely signed session or unbounded duplicate FHIR resources. Every external write needs a stable identifier/conditional-create strategy that survives process restart.

Add safe migrations and rollback notes. Do not destroy existing clinical or user data. Local development may have a generated database, but production startup must fail if required durable infrastructure is absent.

## Real identity, authorization, and tenant boundaries

Replace the static clinician roster and shared secret with real authentication and server-enforced authorization. Prefer Medplum OAuth/SMART or the product's established identity provider if one already exists; otherwise select the smallest production-capable approach and document why.

Requirements:

- authenticated patient or signed appointment invitation resolves to exactly one authorized patient and appointment;
- authenticated clinicians have tenant membership and an allowed role;
- queue and session queries are tenant-scoped;
- claim, decisions, retry, and sign commands verify actor, session version, assignment rules, and resource scope;
- privileged server credentials use least privilege and separate agent from clinician authority;
- unauthorized, cross-patient, cross-tenant, expired-link, stale-session, and replay attempts are tested;
- the UI never accepts an identity display name as proof of identity;
- production token endpoints cannot be used anonymously to mint Deepgram or LLM access.

If real identity cannot be verified, do not call the release production-ready. Complete the code path and return a release blocker with exact setup steps.

## Moss integration

Integrate the correct product: InferEdge Moss, currently published as `@inferedge/moss`, not the unrelated expense-management Moss.

Re-verify the current package, declarations, repository, release status, and license before installation. At prompt-authoring time the package was a beta and its published README said production/commercial use required separate permission even though the bundled license text used PolyForm Shield language. Treat this as a release gate. Obtain or document evidence of a commercial license before enabling Moss in production.

Also treat Moss as an external PHI processor until proven otherwise. Local querying after `loadIndex()` does not by itself prove that index creation, index storage, downloads, embeddings, telemetry, or model hosting are local or covered by a BAA.

### Moss data design

Build patient-scoped retrieval documents from authorized Medplum resources. Each document must carry:

- an opaque document ID, not a raw patient identifier in an index name;
- tenant and patient scope used in mandatory server-side filtering;
- FHIR resource type, id, version, last-updated time, clinical effective/start time, and status;
- normalized searchable text derived from actual chart fields;
- provenance and a stable source reference;
- no invented fact and no cross-patient content.

Include only resource types justified by the product, beginning with medications, medication statements, allergies, conditions, recent encounters/observations, and the scheduled appointment. Minimize the dataset and exclude irrelevant sensitive chart domains.

Index lifecycle requirements:

- create/update on authorized chart warm-up or a background subscription event;
- use a chart-version digest so unchanged data is not re-indexed;
- delete or tombstone removed and revoked resources;
- isolate tenant and patient indexes or enforce equivalent cryptographic/scoped separation;
- warm before the conversation and query locally during the turn when supported;
- apply score thresholds and return “no relevant evidence” as a valid result;
- keep the original FHIR reference on every returned fact;
- measure cold load, warm query, embedding, total retrieval, memory, and index size;
- bound cache size and define eviction without cross-patient reuse;
- make stale-index and Moss-unavailable state visible.

Never expose the Moss project key to the browser. Prefer a server-side long-lived/warm runtime for local querying; evaluate whether the selected Next.js deployment target can keep the index/model warm. If serverless cold starts or runtime incompatibility violate the latency goal, isolate Moss in a small authenticated retrieval service rather than pretending it is warm.

### Moss production gate

Moss may process real PHI only after all of the following have evidence:

- commercial/production license;
- data-flow and subprocessor review;
- BAA or an approved conclusion that no PHI reaches the provider;
- encryption and credential-rotation plan;
- tenant/patient isolation test;
- deletion/retention test;
- load and latency results on the actual deployment runtime.

If those gates cannot be proven, still implement and verify the adapter with synthetic, generated test records and a non-PHI index, but keep it disabled for real production traffic. The production chart path must continue to use authorized deterministic Medplum retrieval and must report Moss as unavailable; it must not fall back to seeded Maria data. Mark the overall release blocked on the missing vendor prerequisite rather than fabricating completion.

## Deepgram production integration

Preserve Deepgram's value: accurate low-latency medical speech, dynamic medication keyterms, barge-in, tool events, and measured latency.

Re-verify the current Voice Agent protocol and selected STT/TTS models. Do not assume fields copied from an old design are valid. In particular, verify Nova/Flux-specific settings, keyterm limits, function request/response fields, auth subprotocols, token TTL, interruption messages, and any required thought signature.

Implement:

- authenticated, rate-limited, session-scoped short-lived token minting after consent;
- credentials only on the server;
- data-minimized settings and prompt context;
- the provider's model-improvement opt-out/retention controls consistent with the clinic agreement;
- server-side execution for tools that read PHI or mutate clinical workflow;
- schema validation, authorization, timeouts, idempotency, and bounded responses for every tool call;
- dynamic keyterms from the authorized patient's active medications, within provider limits;
- robust interim/final transcript handling and duplicate-event suppression;
- connection state, token expiry, reconnect/backoff, session resume or explicit restart, and cleanup of microphones/audio contexts on every failure;
- barge-in that stops queued audio immediately;
- deterministic safety interruption that outranks model speech;
- provider request/session ID, function call ID, latency, selected models, and sanitized failure captured in the durable trace;
- accessible text input and no-audio fallback through the same canonical turn endpoint;
- no app audio retention unless a separate explicit consent and retention design is implemented.

Replace deprecated browser audio processing when necessary for reliable production support. Test supported browsers, mobile permission flows, headphones/speaker echo, background noise, long pauses, rapid interruption, drug names, reconnect, duplicate final transcripts, and network changes.

Do not call Deepgram “live” merely because credentials exist. The UI may show live only after a successful authenticated session and provider event.

## Governed LLM integration

Add an explicit server-side LLM layer even if Deepgram uses a managed think provider. The application must know which model produced each extraction or draft and must be able to validate, evaluate, and replace it.

Choose one primary provider/model after checking current stable models, structured-output support, latency, data retention, regional availability, BAA eligibility, cost, and the repository's existing SDKs. Reusing `@google/genai` may be efficient, but existing code is not a reason to ignore governance. A Deepgram-managed LLM still counts as a provider/subprocessor and must be traced.

Configure provider and model through validated server-only environment variables. Pin an allowed production model rather than silently following a mutable alias. Record provider, model/version, prompt version, latency, usage, trace ID, and outcome for every call without logging raw PHI.

### Allowed LLM jobs

- extract candidate structured facts from a committed transcript turn;
- identify corrections, uncertainty, contradictions, medication-taking statements, and open concerns;
- phrase a concise question for a server-selected intent;
- draft a clinician summary using only canonical evidence IDs;
- optionally translate for clinician review while retaining and linking the original text.

### Jobs the LLM does not own

- red-flag truth or severity;
- drug-risk windows or clinical knowledge tables;
- patient disposition;
- medication advice;
- diagnosis;
- coding not selected from an approved deterministic terminology path;
- payer values or total cost;
- authorization;
- FHIR finalization;
- clinician acknowledgement.

### Structured output contract

Use a strict schema and runtime validation. The result must include:

- extracted fields with normalized value;
- exact transcript character/time span and immutable turn ID;
- assertion source and language;
- confidence/uncertainty and explicit missing fields;
- correction/supersession relationship when applicable;
- evidence IDs used for any drafted statement;
- abstention/refusal state;
- no free-standing clinical fact that cannot be traced to transcript, chart, deterministic rule, payer response, or clinician edit.

Reject malformed, extra, unsupported, or ungrounded output. Retry only when safe and bounded. A timeout, refusal, schema error, or low-confidence result becomes an explicit unresolved item or a simpler deterministic question; it never becomes a confident clinical claim.

Version prompts in code. Keep patient speech clearly delimited as untrusted data. Tool names and arguments come from allow-listed schemas. The model cannot select arbitrary URLs, database queries, FHIR resource types, or privileged actions.

### LLM evaluation gate

Create a repeatable evaluation corpus separate from runtime fixtures. Cover:

- onset phrasing, uncertainty, corrections, negation, history, and contradictions;
- medication names, stopped/taking distinctions, dose ambiguity, and additions;
- prompt injection and requests to ignore clinical boundaries;
- unsupported languages and code-switching;
- benign cases where the correct result is no inference;
- missing chart facts and stale chart context;
- generated summaries that must not introduce facts;
- provider timeout, refusal, truncated output, invalid JSON/schema, and rate limit.

Measure field-level extraction quality, unsupported-claim rate, correction handling, abstention, latency, and cost. Define release thresholds from pilot risk and record actual results. Do not use LLM-graded synthetic success as the only verifier; keep deterministic assertions and targeted human clinical review.

## Real patient and appointment workflow

Remove Maria and seed dependencies from production execution.

Implement a product flow in which:

1. an authenticated patient or signed invitation selects/resolves an actual booked appointment;
2. the server resolves the authorized Medplum Patient and Appointment;
3. consent is captured with accurate wording about transcript/audio handling and a versioned policy;
4. the chart is fetched and Moss index prepared under tenant/patient scope;
5. Deepgram and the canonical turn endpoint run the interview;
6. completion is explicit for routine and escalated sessions;
7. escalation creates a durable requested `Task` at escalation time, not at signature time;
8. the real clinician queue shows actual sessions only, with stable detail routes, assignment, urgency, language/safety coverage, time waiting, and integration state;
9. claim/release is explicit and concurrent claims are safe;
10. clinician approve/edit/reject includes a canonical FHIR preview;
11. finalization is authorized, durable, idempotent, and recoverable;
12. the patient sees only canonical states that actually occurred.

Remove fake queue rows and hard-coded elapsed times. Keep synthetic demo tooling in a separately labeled development/test path that cannot be enabled accidentally in production.

## Medplum and FHIR completion

Use Medplum as the clinical source of truth while the durable database owns application workflow.

Complete and verify:

- patient and appointment resolution by authorized server identity, not fixture identifier;
- real patient demographics and appointment context with no Maria-shaped fallback;
- chart reads including actual coverage references when needed;
- FHIR resource validation against the selected R4 server;
- stable business identifiers for conditional create/update and crash-safe replay;
- preliminary resources first, then authorized finalization;
- Task creation at escalation, assignment/acknowledgement transitions, and completion semantics;
- `Provenance` linking generated content, source resources/turns, model identity, and clinician attestation as appropriate;
- `AuditEvent` for material reads, model-assisted draft creation, review actions, exports, and state changes;
- per-resource receipts based on actual server responses;
- recovery when some writes succeed and others fail;
- no `Condition` created by the agent;
- no placeholder resource ID shown as live.

Validate live against a dedicated non-production Medplum project when credentials are available. Capture sanitized resource IDs and OperationOutcomes. If live validation is unavailable, keep the release gate open.

## Eligibility completion

Replace the hard-coded Maria eligibility input with authorized patient, Coverage, subscriber, provider, and appointment/service context.

Validate request and response schemas. Preserve sparse response semantics. Persist or reference `CoverageEligibilityRequest` and `CoverageEligibilityResponse` consistently with the chosen Medplum/Stedi architecture. Capture provider trace/correlation IDs and sanitized errors.

Do not infer active coverage from HTTP success alone. Do not show zero for a missing deductible/copay. Do not convert 270/271 into a total price or prior-authorization decision.

Production failure returns an explicit unavailable result and queues an office follow-up if the workflow calls for it. Fixtures are allowed only in tests and explicitly enabled local development.

## API and application security

Apply a threat model to patient links, authenticated sessions, voice tokens, prompt injection, tool calls, cross-tenant access, replay, FHIR writes, and operator actions.

Implement proportionate controls:

- runtime request/response schemas;
- secure HTTP-only same-site sessions or equivalent;
- CSRF protection for state-changing browser routes;
- origin checks and CSP;
- rate limits and abuse limits, especially token and LLM endpoints;
- least-privilege service credentials and rotation documentation;
- encryption in transit and at rest through the selected infrastructure;
- PHI-safe structured logging, error sanitization, and access controls;
- dependency and secret scanning;
- transcript/output encoding that prevents stored XSS;
- bounded payloads, timeouts, and cancellation;
- retention, deletion, export, and consent-revocation behavior;
- no production debug route that exposes raw chart, payer, prompt, or model payloads.

Do not claim HIPAA compliance from code changes alone. Provide an exact readiness checklist covering BAAs, risk analysis, policies, training, incident response, backup/restore, retention, and vendor review.

## Reliability, observability, and operations

Carry a correlation ID through appointment resolution, voice session, transcript turn, LLM call, Moss retrieval, deterministic rules, eligibility, review, and FHIR writes.

Expose useful product state without exposing PHI:

- integration health and configuration readiness;
- real origin and last successful event;
- per-turn/provider latency and error class;
- Moss cold/warm/query metrics and index version;
- LLM provider/model/prompt version, schema outcome, latency, and usage;
- queue age, claim conflicts, stuck outbox items, partial writes, and retry status;
- Deepgram connection/reconnect and function-call state;
- Medplum/Stedi request IDs and resource receipts when returned.

Add health/readiness endpoints that distinguish process health from dependency readiness. Production readiness must fail for missing required database/auth configuration and must not advertise disabled providers as healthy.

Define measurable SLOs before the release test. Include chart warm-up, warm retrieval p50/p95, time to first agent audio, turn completion, session API latency, queue delivery, approval completion, external write recovery, and error rate. Benchmark on the actual deployment target and report measurements rather than repeating aspirational numbers.

Provide an operator runbook for credential rotation, provider outage, stuck session, duplicate/replayed event, partial FHIR write, stale Moss index, LLM degradation, restore, and safe retry.

## Runtime modes and configuration

Replace ambiguous fallback behavior with explicit environments such as local development, test, staging, and production.

- Tests may use deterministic fixtures and provider fakes.
- Local development may use fixtures only when explicitly enabled and visibly labeled.
- Staging uses live sandbox providers and generated synthetic patients, not the Maria runtime branch.
- Production requires durable storage, auth, and approved live integrations; it never falls back to fixture data.

Validate environment configuration at startup with a clear schema. Update `.env.example` with names, purposes, server/client boundary, and required-by-environment status. Never put a real secret or patient value in the repository.

At minimum account for database, authentication/session signing, Medplum, Deepgram, Moss, chosen LLM, Stedi, encryption, application URL, and observability configuration. Use provider-specific names only after selecting and verifying the provider.

## Implementation sequence and gates

Use dependency order. Adjust only when code evidence supports a safer sequence.

### Phase 0 — Truth and release prerequisites

- baseline tests/build;
- claim/code mismatch audit;
- provider documentation/version/license/BAA matrix;
- threat model and data-flow map;
- explicit definition of production, staging, and test;
- identify hard blockers before PHI can flow.

Gate: no provider is marked production-approved without evidence.

### Phase 1 — Durable canonical session and identity

- database/migrations/repository;
- authenticated patient/appointment and clinician roles;
- typed command/event APIs;
- canonical server-owned view;
- stable queue routes and explicit claim;
- remove production dependence on fixtures and fake queue rows.

Gate: restart and two-instance tests preserve correct state; cross-tenant/patient tests pass.

### Phase 2 — Single-authority voice and LLM turn

- choose the one turn owner;
- Deepgram production transport;
- schema-validated server LLM extraction;
- deterministic safety on every committed turn;
- real completion, reconciliation, doorknob, correction, and handoff through voice and text;
- durable trace.

Gate: a live non-scripted conversation produces the same canonical workflow as text, without duplicate/divergent replies.

### Phase 3 — Moss retrieval

- provider adapter and data projection;
- patient/tenant isolation;
- index lifecycle and warm query;
- FHIR source links and freshness;
- latency/load/deletion testing;
- licensing/PHI gate.

Gate: changed chart facts change retrieval/question; removed facts disappear; unrelated patients never appear; unavailable Moss removes retrieval claims without fixture substitution.

### Phase 4 — Clinical workflow and external persistence

- Task at escalation;
- real queue/assignment/acknowledgement;
- canonical FHIR preview and explicit decisions including edit;
- crash-safe idempotent Medplum writes;
- Provenance/AuditEvent/receipt and partial-write recovery;
- real eligibility inputs and sparse response.

Gate: failure at every external-write boundary leaves an understandable, retryable, truthful state.

### Phase 5 — Product hardening and release

- accessibility and responsive patient/clinician flows;
- security controls and retention/deletion;
- observability, SLO/load tests, runbooks, backup/restore;
- docs corrected to match reality;
- live staging rehearsals and release decision.

Gate: all automated, integration, E2E, failure, restart, concurrency, and manual acceptance checks pass, or the release is `BLOCKED` with exact evidence.

Do not mark a phase complete because interfaces or tests were sketched. A gate is complete only when the behavior is wired into the real path and verified.

## Verification matrix

Build a verification ledger with `requirement`, `automated evidence`, `live evidence`, `origin`, `status`, and `remaining risk`.

### Automated verification

Run and make green:

- clean dependency install;
- full unit and adversarial suite;
- TypeScript checking;
- lint/static analysis if added;
- production build;
- database migration up/down or forward/restore test;
- API schema and authorization tests;
- repository concurrency and optimistic-lock tests;
- cross-patient and cross-tenant isolation tests;
- LLM contract/evaluation suite;
- Moss adapter, freshness, deletion, filtering, and leakage tests;
- Deepgram protocol/event/reconnect tests;
- FHIR projection/validation/idempotency/partial-write tests;
- eligibility sparse/failure tests;
- browser E2E for patient and clinician in separate contexts;
- accessibility checks on critical flows;
- dependency audit and secret scan.

Provider fakes are appropriate for deterministic automated failure tests. They must not exist as a silent production runtime fallback.

### Live staging verification

When credentials and approved agreements exist, verify with generated synthetic patients in isolated sandbox/staging accounts:

1. Create two patients and appointments; prove no cross-patient retrieval.
2. Read real Medplum resources and capture their IDs/versions.
3. Build/load/query/update/delete a real Moss index and measure cold and warm behavior.
4. Connect a real Deepgram session, speak changed drug/onset facts, verify keyterms, function calls, interruption, transcript deduplication, and reconnect.
5. Run the selected real LLM with structured output, invalid-input cases, refusal, timeout, and evidence-bound summary.
6. Run a real Stedi sandbox eligibility request and verify sparse fields and trace IDs.
7. Complete escalation, queue, explicit claim, edit/reject/approve, sign, receipt, patient status, and idempotent replay.
8. Restart the app between intake and review; repeat with two app instances.
9. Inject Moss, LLM, Deepgram, Medplum, Stedi, and database failures one at a time.
10. Run three consecutive end-to-end passes plus one all-network-failure pass.

Record sanitized evidence. Never put credentials, raw audio, raw PHI, tokens, or full payer payloads in logs or the repository.

If credentials or licensing prevent a live check, complete deterministic work but mark that row `UNVERIFIED` and the production release `BLOCKED` when it is a required dependency.

## Documentation and claim cleanup

Update `README.md`, `RUNNING.md`, `CLAUDE.md`, and `.env.example` only where the implementation changes reality.

Actively correct claims currently likely to be stale, including function count, queue behavior, audio recording/playback, AccessPolicy enforcement, audit coverage, fixture behavior, live FHIR persistence, current test count, voice models/settings, and “built and verified” statements.

Keep a short architecture/data-flow section, a deployment guide, a provider prerequisite table, and an operator runbook. Do not bury limitations. A reader must be able to tell what is production-capable, what is staging-only, and what is blocked by external agreements.

## Scope judgment

Use judgment to make the product coherent. Prefer a complete vertical slice over many providers that only compile.

Do not broaden into diagnosis, treatment selection, patient-specific medication advice, a general clinical knowledge base, autonomous charting, prior authorization, guaranteed pricing, image diagnosis, or unlimited multilingual safety claims.

Do not preserve hackathon behavior merely because a test asserts it. If a test encodes a demo claim that conflicts with the production product, replace it with a stronger product invariant and explain the change.

Do not delete the synthetic demo/proof capability if it remains useful. Isolate it from production, label it, and ensure it cannot be selected by a production request.

If an external license, BAA, identity decision, or deployment credential is missing, continue all safe in-scope work. Stop only at the precise boundary that requires new authority, and return a concrete blocker rather than pretending completion.

## Final release review

Before handoff, run an adversarial review in a fresh context or independent verifier when available. It must try to disprove:

- patient and tenant isolation;
- one-authority conversation behavior;
- deterministic safety precedence;
- provenance and evidence binding;
- no fixture fallback in production;
- no unsupported LLM claim;
- no secret in the browser;
- clinician-only finality;
- crash-safe idempotency and partial-write recovery;
- accurate live/failed/unverified labels;
- Moss license/PHI readiness;
- Deepgram/LLM/Medplum/Stedi live evidence.

Fix confirmed P0/P1 issues and rerun affected gates. Do not declare `PASS` from the same assumptions used to build the feature.

## Final handoff contract

Return:

1. `GO` or `BLOCKED` for production release, with the decisive evidence.
2. The user-visible product outcome now completed.
3. Files, migrations, routes, and provider integrations changed.
4. The final architecture and canonical turn/state flow.
5. A table for Moss, Deepgram, LLM, Medplum, Stedi, database, and auth showing configured version/provider, live evidence, data origin, latency, failure behavior, and remaining prerequisites.
6. Automated test, typecheck, lint, build, migration, E2E, accessibility, security, load, restart, and concurrency results.
7. Live staging results with sanitized trace/resource IDs, or exact `UNVERIFIED` reasons.
8. Security, privacy, licensing, BAA, retention, backup, and deployment readiness.
9. Known limitations and operator recovery steps.
10. The next three product bets, ranked by customer value, clinical risk, and engineering risk.

Do not report “integrated” when only a dependency or adapter exists. Do not report “production-ready” while a required live, security, licensing, identity, persistence, or recovery gate is unverified. Leave the repository in the strongest demonstrable state possible and make every remaining blocker explicit.
