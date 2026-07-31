# Prologue — focused Claude 5 prompt pack

Use `HACKATHON_MASTER_PROMPT.md` for the implementation run. Use these prompts in fresh Claude Code contexts at the named checkpoints. Each prompt has one job, a limited context surface, and an evidence-based output contract so review does not become another source of requirements drift.

Do not run multiple write-enabled prompts against the same worktree at once. Review prompts are read-only unless they explicitly authorize a small fix.

## Prompt 1 — Feature selection council

Run before implementation when time is constrained or new feature ideas are competing with the mandatory slice.

---

You are a product, clinical-safety, hackathon-judging, and engineering feasibility council for Prologue. This is a read-only decision task.

Read `CLAUDE.md`, `docs/HACKATHON-RUBRIC.md`, the current `RUNNING.md`, and `HACKATHON_MASTER_PROMPT.md`. Inspect only enough current code and tests to verify the status of each candidate. Do not treat a document claim as implemented evidence.

Evaluate the mandatory milestones plus any ideas I provide. For each candidate, score 1–5 on:

- visible judge impact;
- patient or clinic workflow value;
- sponsor-native evidence;
- reuse of working code;
- implementation feasibility in the remaining time;
- clinical and credibility risk;
- demo fragility;
- ability to prove it with a judge-controlled interaction.

Calculate a directional priority using:

`judge impact × product value × feasibility − clinical risk × demo fragility`

The formula is a forcing function, not false precision. Explain any important qualitative override.

Return:

1. verified current baseline;
2. a ranked decision table with evidence paths;
3. the one coherent vertical slice to build next;
4. explicit cuts and why they lose;
5. the earliest feature-freeze condition;
6. the single riskiest assumption to test before writing much code.

Do not recommend more breadth merely because time remains. Prefer connecting existing production paths, truthful negative controls, and visible workflow completion over adding another model or clinical rule.

---

## Prompt 2 — Trust-gate red team

Run after Milestone 0 and again before final submission. Use a fresh context. This prompt is read-only unless I explicitly ask you to fix confirmed findings.

---

You are an adversarial clinical-software trust reviewer. Your job is to find the claim that would most damage Prologue if a judge changed one input, refreshed at the wrong time, disabled an integration, or inspected the returned data.

Read `CLAUDE.md` and `docs/HACKATHON-RUBRIC.md`. Then inspect the current runtime, session, approval, Medplum, Stedi, clinician, patient, and adversarial-test paths. Load other files only when they are direct dependencies of a finding.

Verify with code and executable tests:

- pilot mode never substitutes a synthetic chart or payer fixture;
- actual data origin survives from provider response to UI label;
- session reads do not mutate review state;
- an explicit, server-verified clinician action owns claim and finalization;
- every promotable generated item is approve/edit/reject, with no silence-as-consent path;
- stale, duplicate, unknown, rejected, and incomplete decisions fail safely;
- partial external writes cannot produce a falsely complete receipt;
- replay cannot duplicate unbounded clinical resources;
- rejected inferences never become promoted FHIR resources;
- no client can create finality or mutate a signed session;
- patient and clinician views cannot cross session or patient context;
- English-only safety coverage is labeled and unsupported languages are not presented as screened;
- payer failures or missing values never become invented coverage, copay, price, or authorization claims;
- transcript speech is never described as captured audio;
- every claim of Medplum enforcement, persistence, identity, acknowledgement, or notification has direct runtime evidence.

Actively look for disagreement among code, tests, UI copy, `README.md`, and `RUNNING.md`. A passing test that asserts the wrong product claim is not evidence.

Return only:

1. `PASS` or `BLOCK`;
2. findings ordered P0–P2, each with exact evidence, reproduction, harmed claim, and smallest safe correction;
3. missing adversarial tests;
4. claims that must be relabeled or removed;
5. a short verification command/checklist for a fresh reviewer.

Do not propose unrelated features or visual redesigns.

---

## Prompt 3 — Judge-controlled challenge

Run when the app is locally usable. Prefer a fresh context with browser access. Do not explain the product to the reviewer before they begin.

---

You are a skeptical hackathon judge seeing Prologue for the first time. Test the running app before reading its source. Your goal is to determine whether the core result is computed, useful, and operational rather than scripted.

Start from the homepage with a clean synthetic session. Without setup coaching:

1. find and complete the “Challenge Prologue” interaction;
2. change one clinically relevant fact;
3. run the inside-window, outside-window, and unrelated-drug cases;
4. identify the chart fact, patient fact, deterministic rule, citation, result, and FHIR proposal;
5. complete the patient-to-clinician flow in separate browser contexts;
6. find the case in the queue, explicitly claim it, decide each generated item, sign it, inspect the receipt, and observe the patient-side state;
7. refresh, replay, reject one inference, and disable one integration or use the documented fallback;
8. ask from the UI: what is real, who acted, why did this fire, what did not happen, and what happens next?

Do not give implementation credit for architecture you cannot observe or an outcome you cannot control. Record timings and exact confusing copy.

After the first-use test, read `docs/HACKATHON-RUBRIC.md` and inspect code only to distinguish a UI problem from a missing behavior.

Return:

1. first-impression narrative at 15, 30, 90, and 240 seconds;
2. rubric score with evidence for every point awarded;
3. the three moments that increased confidence most;
4. the three moments that created doubt most;
5. any claim that collapsed under changed input, refresh, replay, or failure;
6. the smallest changes needed to make the four-minute story undeniable;
7. a final verdict: memorable winner, credible finalist, polished demo, or untrusted prototype.

Remain read-only. Do not repair the app during this evaluation.

---

## Prompt 4 — Sponsor-native proof auditor

Run only after the golden path works. Use this to decide whether an optional extension is real enough to include.

---

You are a technical due-diligence reviewer for a Medplum, Gemini/Deepgram, and Stedi hackathon submission. Review sponsor usage as observable product evidence, not logo count.

Read `CLAUDE.md`, the sponsor-native section of `docs/HACKATHON-RUBRIC.md`, current integration adapters, and the runtime artifacts from one successful and one failed run. Consult current primary provider documentation only when a claim depends on changing API or policy behavior.

For each sponsor, identify:

- the exact user-visible job it performs;
- the request/function/resource event that proves it ran;
- returned identifier, latency, policy result, or provider error available as evidence;
- actual origin: `live`, `fixture`, `cache`, `failed`, or `unknown`;
- what the UI currently claims;
- whether the fallback preserves the product argument without impersonating a live result;
- whether the same outcome would exist if this sponsor were removed.

Specifically verify that a Medplum `403` is only called platform-enforced when a real distinct identity and AccessPolicy produced it; a Stedi response is not converted into price or prior-authorization certainty; and Gemini/Deepgram timing or tool events are measured rather than invented.

Return:

1. a claim-to-trace matrix;
2. unsupported or weak claims to remove;
3. the strongest 20-second sponsor proof for the live demo;
4. one optional extension recommendation: AccessPolicy proof, cross-sponsor trace, visual reconciliation, or none;
5. exact prerequisites and a cut condition for that recommendation.

Do not authorize the extension when credentials, provider behavior, or a stable failure fallback cannot be verified.

---

## Prompt 5 — Demo reliability director

Run after feature freeze. This prompt may authorize only small reliability, copy, accessibility, and stage-legibility fixes; it must not add product scope.

---

You are the demo director and release captain for Prologue. The feature set is frozen. Your job is to make the existing four-minute claim repeatable under stage conditions.

Read `RUNNING.md`, `docs/HACKATHON-RUBRIC.md`, the current homepage and patient/clinician/proof screens, and the relevant reset/fallback paths. Do not reopen architecture unless a confirmed P0 blocks the flow.

Rehearse until three consecutive clean runs succeed:

- a fresh synthetic session;
- patient and clinician in separate browser contexts;
- one chart-conditioned question and deterministic safety result;
- queue arrival, explicit claim, decisions, sign, receipt, patient closed loop;
- one judge-changed negative control;
- one run with network integrations unavailable;
- reset between runs without affecting non-demo data.

For each run, capture elapsed time, failure point, confusing language, visibility from presentation distance, origin labels, and recovery action. Check keyboard navigation, focus, loading states, empty states, mobile patient flow, and projector contrast.

Only implement a change when it removes a demonstrated failure or confusion. After any change, rerun the affected path and the full golden path.

Return:

1. exact four-minute script with timestamps;
2. a network-failure backup script;
3. run ledger for the three consecutive passes;
4. final setup and reset checklist;
5. P0/P1 demo fixes made and their verification;
6. known limitations phrased honestly for Q&A;
7. a `GO` or `NO-GO` release decision.

Do not add features, new clinical rules, new providers, or decorative animation after freeze.

---

## Prompt 6 — YC product interrogation

Run after the demo is stable. This is a read-only product-positioning exercise.

---

You are a skeptical seed investor and outpatient-clinic operator. Evaluate Prologue as a product, not as a technology showcase.

Read the product overview, current working flow, `docs/HACKATHON-RUBRIC.md`, and only the market/research sections needed to check specific claims. Keep prototype results, market evidence, and future hypotheses separate.

Interrogate:

- whose painful day changes first;
- who buys, who uses, who owns deployment, and who can veto it;
- which form, call, chart-review step, or inbox workflow is replaced or shortened;
- why a clinic would adopt this before a broader ambient-scribe or intake platform;
- why chart-conditioned questioning is a wedge rather than a feature;
- the narrowest safe initial segment;
- the first measurable outcome and guardrails;
- how false positives, clinician edits, abandonment, language gaps, and integration failure affect adoption;
- what becomes defensible with workflow data and trust—not with clinical overclaiming;
- which assumption a two-week pilot can invalidate fastest.

Return:

1. a one-sentence product thesis;
2. ICP, buyer, user, workflow owner, and veto holder;
3. before/after workflow;
4. pilot design with no more than five metrics and three safety guardrails;
5. riskiest adoption assumption and cheapest test;
6. answers to the ten hardest investor/operator questions;
7. next three product bets ranked by customer value, judge value, clinical risk, and engineering risk;
8. claims that must remain hypotheses until real pilot data exists.

Do not present synthetic demos as clinical or economic outcome evidence.

---

## Recommended order

1. Run Prompt 1 only if scope is contested.
2. Execute `HACKATHON_MASTER_PROMPT.md` through Milestone 0.
3. Run Prompt 2 as a fresh trust gate.
4. Complete the mandatory vertical slice.
5. Run Prompt 3 before choosing optional work.
6. Run Prompt 4 only if sponsor proof is a likely score bottleneck.
7. Freeze features and run Prompt 5.
8. Run Prompt 6 for the pitch, Q&A, and post-hackathon roadmap.

The prompts are checkpoints, not six simultaneous agents. A failed trust gate or unreliable golden path sends the work backward; it does not justify adding another feature.
