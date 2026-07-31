# Productization prompt for Prologue

Use this prompt with Claude Code from the repository root.

---

You are the product and engineering lead for Prologue. Turn the current hackathon demo into a credible pilot-ready product for outpatient clinics while preserving the behavior that makes it valuable: a chart-aware pre-visit conversation that surfaces useful, source-linked information for a clinician to review.

Start by reading `CLAUDE.md`, then use progressive disclosure. Read `README.md` for the product and safety model, `RUNNING.md` for the implementation's real/simulated boundaries, the relevant parts of `docs/01-PRODUCT-DESIGN.md`, and the tests that encode affected invariants. Inspect the actual implementation before trusting an aspirational document.

The current app proves the concept, but it is still centered on one synthetic patient. The highest-value productization work is to replace that demo-shaped control plane with a real, server-authoritative workflow:

1. Durable, patient-keyed intake sessions connected to appointments and users, with explicit lifecycle states.
2. A multi-patient clinician queue with assignment, status, urgency, and a stable session detail route.
3. A secure approval transaction that reloads canonical server state, validates the clinician and selected items, persists accepted/rejected decisions, performs the real preliminary-to-final FHIR transition, and records `Provenance` and `AuditEvent`. It must be idempotent and must not trust a client-supplied final state.
4. Real draft persistence for the appropriate FHIR resources (`Consent`, `QuestionnaireResponse`, `Observation`, `DetectedIssue`, `MedicationStatement`, `Composition`, and `Task`) without letting the agent create a `Condition`.
5. Explicit runtime modes: synthetic demo mode may fall back to labeled fixtures; pilot/production mode must surface integration failure and never silently substitute synthetic clinical or payer data.

Use your judgment to refine the order after examining the code. Build the smallest coherent vertical slice that makes the product meaningfully more deployable; do not scatter placeholders across all five areas. Prefer extending the existing Next.js/Medplum architecture unless evidence shows a different component is necessary.

Preserve these acceptance properties:

- The chart-conditioned question remains computed from the selected patient's chart and current conversation.
- Patient, chart, inference, insurance, and clinician provenance never collapse into one undifferentiated summary.
- Deterministic red-flag evaluation runs on every clinical turn and fails closed. An LLM may help converse or extract a draft, but it does not own the safety decision.
- Patient-facing output does not name a diagnosis or present an eligibility response as a guaranteed price or prior-authorization answer.
- Only an authorized clinician action can finalize clinical data. Draft APIs reject `final` and `completed` states.
- Failures, fixture data, cached data, and live data are distinguishable in the data model and UI.
- Existing English, multilingual, browser, and scripted voice paths keep working unless a deliberate migration is documented and tested.

Before implementation, give me a compact evidence-backed gap assessment and a phased release plan. Separate:

- what the code already does;
- what the docs claim but the code does not yet do;
- what is required for a clinic pilot;
- what should wait until after the pilot.

Include product judgment, not just architecture. Define the first ideal customer profile, the exact workflow Prologue replaces or shortens, the buyer and daily user, the first measurable outcome, pilot success metrics, and the riskiest adoption assumption. Treat regulatory, privacy, security, accessibility, multilingual equity, and clinical governance as design inputs. Verify unstable integration or regulatory claims against primary sources before relying on them.

Then implement the first productization phase in the repo. Update tests and only the documentation made inaccurate by the change. Exercise both happy and failure paths. Run `npm test`, `npm run typecheck`, and `npm run build`. If external credentials prevent a live check, complete deterministic verification and state exactly what remains unverified.

Finish with:

1. What changed and why it is the best first product slice.
2. A concise architecture and data-flow summary.
3. Test and build results.
4. Remaining risks or manual setup.
5. The next three product bets, ranked by expected customer value versus clinical and engineering risk.

Do not optimize for adding the most features. Optimize for a trustworthy workflow a real clinic can trial, with evidence that it saves clinician preparation time without hiding uncertainty or moving clinical authority away from the clinician.

