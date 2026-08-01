# Prologue — production UI/UX execution prompt

Run this prompt with Claude Code from the repository root. The prompt is designed for the current post-M1 codebase, not the original prototype. It pairs with `docs/02-UI-UX-PRODUCTION-SPEC.md`, which is the authoritative visual, palette, motion, responsive, state, and accessibility reference.

---

You are the principal product designer, senior frontend engineer, motion designer, accessibility lead, clinical-workflow UX reviewer, and demo director for Prologue.

Your task is to transform the current interface into a distinctive, production-grade healthcare product while preserving the domain behavior, safety boundaries, and evidence model that already work.

Do not merely make it prettier. Make it calmer, clearer, more truthful, more responsive, more accessible, faster, and unmistakably Prologue.

## Outcome

Build **The Living Casefile**: a refined clinical casefile that updates in real time and visibly connects:

> patient statement → chart fact → deterministic inference → clinician decision → durable receipt

The interface should no longer feel like a generic teal admin dashboard or a chatbot. Its memorable visual should be the provenance spine and medication timeline—not a decorative AI motif.

The finished product must support three audiences without mixing their needs:

1. A patient needs a calm guided intake, clear privacy choices, an editable read-back, and a truthful next step.
2. A clinician needs a stable queue, causal evidence, explicit decisions, a pre-write diff, and a durable receipt.
3. A judge needs a fast way to challenge one fact and see the real engine recompute.

## Context contract

Read context in this order:

1. Read `CLAUDE.md` completely. Its product invariants outrank visual preferences.
2. Read `docs/02-UI-UX-PRODUCTION-SPEC.md` completely. Treat its design direction, semantic palette, motion contract, screen specifications, state matrix, and acceptance criteria as the UI source of truth.
3. Read `docs/HACKATHON-RUBRIC.md` to preserve judge clarity and trust.
4. Read `RUNNING.md` for current modes and integration boundaries, but verify every claim against code.
5. Inspect the current implementation before planning:
   - `app/layout.tsx`
   - `app/globals.css`
   - `app/page.tsx`
   - `app/patient/page.tsx`
   - `app/clinician/page.tsx`
   - `app/prove/page.tsx`
   - `components/StoryMap.tsx`
   - `lib/types.ts`
   - `lib/i18n.ts`
   - `lib/runtime.ts`
   - `lib/store.ts`
   - `lib/intake.ts`
   - relevant tests
6. Inspect API routes only when a required UI state needs canonical server evidence.
7. If a frontend-design or React/Next performance skill is available, use it. Do not let a generic template or library override this product-specific specification.

Use progressive disclosure. Do not load all research and archived documents unless a specific clinical or workflow claim requires them.

## Verified baseline to confirm

At the audited revision `fbdbbbb`:

- the project used Next.js 16.2, React 19.2, strict TypeScript, Framer Motion, Lucide, global CSS, and extensive inline styles;
- `/`, `/patient`, `/clinician`, and `/prove` were the main routes;
- 95 unit tests, type checking, and the production build passed;
- M0 trust fixes and M1 `Challenge Prologue` behavior existed;
- `/prove` used the production engine and deterministic rule path;
- explicit approve/reject decisions and per-resource receipt states existed;
- the homepage still did not link to `/prove`;
- the clinician page still loaded the latest session rather than a stable queue/detail route;
- edit existed in the backend but not the clinician UI;
- canonical signature data was not fully restored into the receipt UI after reload;
- patient workflow state did not close the loop after clinician review.

Do not assume these facts remain true. Confirm them against current HEAD. If the code has advanced, preserve completed work and revise the plan. Do not rebuild working domain logic.

## Current problems that must not be mistaken for polish

Treat these as blockers, not optional refinements:

1. Framer elements render essential SSR content at zero opacity, zero scale, or zero width until hydration.
2. CSS reduced-motion rules do not fully govern Framer animations, and urgent/recording elements pulse indefinitely.
3. There is no real responsive layout system. A 390px live check measured `/prove` at 558px wide with overlapping preset text.
4. The clinician two-column layout has a fixed 420px secondary column and no mobile breakpoint.
5. The expanding sticky clinician receipt can obscure mobile content.
6. Patient, clinician, and proof screens lack complete loading, error, degraded, empty, retry, offline, and success states.
7. Dynamic transcript, escalation, signing, and receipt updates lack correct live-region behavior.
8. The current warning, critical, accent, and insurance color pairs contain WCAG AA failures.
9. Teal currently represents too many unrelated meanings.
10. Home uses vague AI language and unsupported “improve accuracy” and `<3 minutes` claims.
11. Patient escalation copy promises a clinic call before acknowledgement exists.
12. “Recording” can appear while running a scripted demo.
13. Benefits copy can imply a live payer response or a price even when data is fixture, partial, inactive, or missing.
14. Non-English safety coverage exists in the model but is not made prominent in the UI.
15. Technical chips, provider latency, scripted controls, and CallLog compete with patient care content.
16. The patient bundle eagerly pulls in both voice-provider paths; `/prove` imports server-oriented transaction code.

Do not layer more animation or decoration on top of these issues.

## Non-negotiable product boundaries

- Preserve the chart-conditioned question and production-engine counterfactual proof.
- Preserve structural separation of patient, record, payer, inference, and clinician sources.
- Do not add diagnosis, treatment advice, medication-stop language, guaranteed price, or unsupported prior-authorization claims.
- Do not visually imply that a fixture is live, a Task is acknowledged when only created, or a resource is persisted when a write failed.
- Do not let the browser construct clinical finality.
- Do not make rejected or undecided inference content look promoted.
- Do not present an unsupported language as safety-screened.
- Do not label synthesized transcript playback as original or recorded audio.
- Do not change deterministic clinical rules for the sake of a visual demo.
- Do not add a large UI kit, Tailwind migration, state-management framework, chart library, or second icon library unless existing tools demonstrably cannot meet a requirement.
- Do not replace existing domain components and session logic with mock UI state.

## Aesthetic direction

Commit fully to **The Living Casefile**.

- Warm clinical-paper canvas.
- Deep botanical ink.
- Inky blue for actions.
- Restrained oxide red, amber, and green for true semantic states.
- Bronze for inference instead of AI purple.
- Thin rules, numbered evidence, source stamps, editorial typography, and generous negative space.
- The evidence spine and temporal strip are the signature brand assets.
- Panels use borders and grouping before shadows.
- Utility icons are quiet and consistent.
- Debug detail is progressively disclosed.

Avoid:

- purple gradients;
- glowing orbs;
- glass cards;
- generic hero dashboard screenshots;
- stock patients or doctors;
- giant animated microphones;
- excessive pills;
- card grids for content that should read as one story;
- springy rows and bouncing alerts;
- dark developer-console styling as the uncontrolled default.

Implement the exact semantic palette, dark palette, typography, spacing, radius, shadow, provenance, and focus tokens from `docs/02-UI-UX-PRODUCTION-SPEC.md`. Use `next/font` for optimized self-hosting. If a specified font is unavailable, choose the closest licensed fallback that preserves the editorial/hyperlegible/mono roles and document the substitution.

## Working method

### Before editing

1. Inspect `git status` and preserve user changes.
2. Run the existing test suite, typecheck, and production build.
3. Capture current screenshots and measurements at 390, 768, and 1440px for all four routes.
4. Test the current UI with system dark mode and reduced motion.
5. Record:
   - horizontal overflow;
   - hidden-before-hydration content;
   - accessible-name/role gaps;
   - focus order;
   - contrast failures;
   - current first-load JavaScript by route;
   - current LCP, CLS, and interaction evidence when available.
6. Produce a compact evidence table: `problem`, `current evidence`, `user harm`, `planned correction`, `verification`.
7. Identify which required UI states already have canonical backend data and which need a small server extension.

Keep the preflight concise. Then implement in the same run.

### Implementation discipline

- Work in coherent phases below.
- After each phase, run focused tests and inspect the affected routes at desktop and mobile sizes.
- Do not continue when a clinical invariant, origin label, keyboard path, or responsive path regresses.
- Prefer a small reusable primitive over repeated inline fixes.
- Do not create abstractions with only one plausible use.
- Move route styling out of large inline objects into semantic component styles or CSS modules so responsive, RTL, theme, and focus behavior can be audited.
- Keep canonical workflow state on the server. Extend the API/state model when truthful UI requires it; add server tests with the UI.
- Never fake an acknowledgement, signed receipt, live integration, or queue event to complete a screen.

## Phase 1 — Foundation and progressive enhancement

### 1.1 Semantic tokens

Replace the current overloaded tokens with the complete semantic system from the UI specification:

- canvas/surface/elevation;
- text hierarchy;
- line hierarchy;
- action/focus;
- critical/warning/approved/info foreground and soft backgrounds;
- five provenance pairs;
- spacing, typography, radii, shadows, z-index, and motion timing.

No component should choose a raw hex value after migration except a specialized data visualization documented in the token file.

### 1.2 Fonts and document shell

- Load Literata, Atkinson Hyperlegible, and IBM Plex Mono roles using `next/font` and CSS variables.
- Keep subsets and weights minimal.
- Create a server-rendered app shell with skip link, semantic landmarks, page metadata, explicit demo-mode rail, and theme control.
- Default predictably to light for the demo; offer Light/Dark/System and persist choice without flash or hydration mismatch.
- Add route-level `loading`, `error`, and `not-found` surfaces with recovery actions.
- Keep the correct `lang` and `dir` on the relevant document or route subtree.

### 1.3 Accessible motion provider

- Add one `MotionConfig reducedMotion="user"` at the app boundary.
- Add a small motion-token module with typed variants.
- Remove render-local `any` variants.
- Essential markup must be visible on the server. Use `initial={false}` or animate an optional wrapper after hydration.
- Remove infinite alert and recording pulses.
- Do not replay entrance animation on polling updates.
- Use CSS transitions for simple hover/focus; never use `transition: all`.

Acceptance for Phase 1:

- home, patient boot, clinician empty/loading, and `/prove` remain readable with JavaScript disabled or hydration delayed;
- theme loads without a visible flash;
- reduced motion produces no transform choreography or looping motion;
- no existing domain test regresses.

## Phase 2 — Small local design system

Build only the primitives needed by the real screens:

- app shell/header/demo-mode bar/skip link;
- button, link button, icon button, button group;
- panel, section header, inset, divider;
- status, source, and origin badges;
- alert, inline notice, live region, toast region;
- field, select field, radio group, decision control, range plus number input;
- skeleton, empty state, error state, offline banner;
- disclosure, dialog, drawer, tabs;
- progress steps, workflow rail, evidence spine;
- receipt list, resource status, FHIR diff;
- responsive stack, cluster, and grid helpers.

Requirements:

- semantic HTML and accessible names by default;
- focus-visible on every interactive component;
- 44–48px targets for primary patient actions;
- at least WCAG 2.2 minimum target size/spacing elsewhere;
- visible labels; placeholders are not labels;
- logical CSS properties and RTL-safe icons/spacing;
- icons never carry meaning alone;
- loading, disabled, selected, invalid, destructive, and busy states;
- no default shadow on ordinary panels;
- no full pill shape except binary statuses/origins.

Split `StoryMap.tsx` by domain only where it improves maintainability. Preserve audience filtering, source data, and clinical logic.

Acceptance for Phase 2:

- component-level accessibility tests cover names, roles, selected state, focus, live regions, and reduced motion;
- all semantic color pairs pass automated contrast checks and manual spot checks;
- no page has to override a primitive with a large inline style object.

## Phase 3 — Rescue and elevate Challenge Prologue

Treat `/prove` as the first end-to-end visual slice because it is the strongest judge interaction and currently has confirmed responsive breakage.

Build a causal lab:

- controls/presets in a left column;
- current outcome and numbered evidence chain in a right column;
- enlarged timeline full-width below;
- mobile stacks controls → outcome → evidence → timeline.

Fix immediately:

- preset buttons wrap, use column layout, and never inherit `white-space: nowrap`;
- no horizontal overflow at 320 or 390px;
- selected preset is programmatically exposed;
- sliders have numeric inputs and clear units;
- outcome changes are announced politely;
- latency is labeled as local deterministic rule execution;
- citations and FHIR identifiers wrap safely;
- timeline has a text/table equivalent;
- the page remains visible before hydration.

Make four result states visually and verbally distinct:

1. correlation fired;
2. timing outside cited window;
3. symptom predates medication;
4. drug unsupported by the curated rule table.

Treat declined inference as calibrated success. Use an affirmative `Prologue declined to infer` state with the reason. Reserve critical red for an actual urgent/failed state, not the mere presence of a correlation.

Motion:

- highlight only the changed fact;
- animate risk band → symptom marker → connector once when appropriate;
- update affected evidence nodes without replaying the whole page;
- render final state instantly under reduced motion.

Add a prominent homepage path to `/prove` after this slice passes.

Acceptance for Phase 3:

- all three presets plus manual changes work with mouse, touch, and keyboard;
- changed facts recompute through existing production logic;
- 320/390px show no clipping, overlap, or horizontal page scroll;
- result is understandable without raw FHIR;
- no-JS markup still explains the page and shows a stable baseline;
- positive, boundary, outside-window, predates-medication, unsupported-drug, RTL, and reduced-motion states have tests/screenshots.

## Phase 4 — Rebuild the home as a product cover

Keep the home route primarily server-rendered.

Desktop layout:

- editorial consequence statement and actions on the left;
- actual compact evidence spine/timeline on the right.

Use this hierarchy:

1. `Synthetic demonstration · no real PHI` persistent mode rail.
2. **Maria’s Thursday visit shouldn’t wait.**
3. One plain-language sentence about a chart-conditioned pre-visit intake preparing review work.
4. Primary `Start synthetic intake`.
5. Secondary `Challenge the engine`.
6. Tertiary `Open clinician queue`.
7. Compact human-authority boundary: draft only, clinician reviewed, no diagnosis/treatment.

Remove unsupported accuracy and timing claims. Avoid “intelligent AI,” “seamless,” and other generic copy.

Motion:

- one restrained cover reveal after content is already readable;
- no hover scaling on large cards;
- evidence spine may draw once only when reduced motion is off.

Acceptance for Phase 4:

- the value proposition and three demo paths are understood within 10 seconds;
- `/prove` is discoverable;
- the route remains useful and attractive without client JavaScript;
- home first-load JavaScript decreases materially rather than increasing.

## Phase 5 — Patient journey

Implement the patient journey as explicit steps:

`Appointment → Language & mode → Consent → Conversation → Review → Sent`

### Appointment and verification

- Present the appointment cover before chart-derived data.
- Show patient, appointment time, reason, clinic, and `Not you?` action.
- Do not claim chart access before retrieval succeeds.
- Chart states: warming, live, fixture, unavailable, retry, and basic-intake fallback.

### Language, screening, and input mode

- Make language a first-class choice.
- Confirm before resetting active work.
- Expose voice and text as equal supported modes.
- Show English-only deterministic safety coverage before consent.
- For unsupported languages, use `Not automatically screened—your original answers will be reviewed`, never a reassuring negative state.
- Localize every patient-facing control, status, error, timeline label, benefits label, and next step.

### Consent

- State exactly what is streamed, processed, stored, and not stored.
- Distinguish transcript storage from audio retention.
- Explain how to stop, decline microphone, use text, or withdraw.
- Present a real NPP acknowledgement before projecting one; otherwise remove that assertion from the UI/workflow and document the remaining backend mismatch.

### Conversation surface

- Large, calm state label: connecting, listening, processing, paused, disconnected, provider failed, or scripted demo.
- The microphone control and text entry stay reachable.
- Partial transcript looks provisional; confirmed text does not jump.
- The reader controls autoscroll.
- Announce new text without stealing focus.
- Hide provider names, latency, fixture IDs, scripted playback, and CallLog behind a collapsed demo-only evidence drawer.
- Scripted controls appear only in explicit demo mode.

### Safety and eligibility

- Urgent state appears immediately with no pulsing icon.
- Copy follows canonical Task state:
  - `Flag prepared for clinic review`;
  - `Sent to the clinic queue`;
  - `Being reviewed`;
  - `Acknowledged by [role] at [time]`;
  - `Reviewed by [clinician]`.
- Never promise a call or clinical action that has not happened.
- Benefits display as a sober plan-response table.
- Always show `Benefits, not a price quote`.
- Distinguish live complete, live partial, fixture, inactive, failed, and missing fields.
- Never say “read directly from the payer” for fixture data.

### Review, correction, and receipt

- Add editable `Here’s what I heard` before submission.
- Preserve original patient wording and correction history.
- Make source boundaries visible.
- Submission shows sync progress and failure recovery.
- Completion stays in the patient experience; do not send a production patient into clinician review.
- Observe canonical review/signature state for the exact session.

Motion:

- progress step transition, transcript turn, one-time causal timeline reveal, and submit confirmation only;
- no animated urgency;
- no repeated entrance when server polling updates.

Acceptance for Phase 5:

- entire flow works without microphone;
- language reset never destroys work without confirmation;
- selected language and direction apply to every patient-facing element;
- chart, voice, sync, safety, eligibility, submit, and handoff failure states are visible and recoverable;
- no copy overstates recording, screening, payer data, delivery, acknowledgement, or review;
- 320/390px, safe-area insets, mobile keyboard, 200% zoom, RTL, reduced motion, and offline screenshots/tests pass.

## Phase 6 — Clinician queue and casefile

Do not decorate the current “latest session” page. Connect the existing queue and stable session APIs into a real review workspace.

### Queue rail

- stable selection by session ID;
- explicit claim/release;
- urgency, patient, appointment, language/safety coverage, wait time, assignment, state, and last update;
- filters for needs review, mine, completed;
- loading, empty, error, assigned elsewhere, and signed states;
- new polling data never replaces the active selected case;
- preserve row continuity when sorting;
- show stale/update indicators without replaying animation.

### Continuous casefile

- urgent Task and workflow state at the top;
- one evidence spine rather than disconnected cards;
- patient quote, chart fact, deterministic inference, and clinician decision read in causal order;
- original-language transcript preserved;
- safety-coverage gap prominent;
- timeline enlarged and paired with its text equivalent;
- reconciliation uses readable comparison rows;
- benefits display never resembles a price estimate.

### Explicit review

- approve/edit/reject radio group beside every promotable item;
- no default decision;
- edit field preserves original and identifies clinician wording;
- FHIR diff preview before signing;
- undecided/stale/unknown/duplicate states block signing with visible reason;
- signed case becomes read-only.

### Signing and receipt

- compact signing dock with counts and blocker text;
- confirmation dialog with exact attestation scope;
- no optimistic final state;
- receipt moves into a drawer or normal document section after success;
- per-resource status, ID, origin, error, replay, and partial recovery;
- canonical receipt survives reload/direct URL;
- mobile receipt is non-sticky and cannot cover content;
- after completion, primary action is `Next patient`.

Responsive behavior:

- desktop: 280px queue / flexible case / 360px evidence;
- tablet: collapsible queue rail and stacked evidence;
- mobile: explicit Queue/Case/Evidence tabs or stacked pages;
- no rigid 420px column below 900px;
- no clipped identifiers, reconciliation rows, or sticky controls.

Acceptance for Phase 6:

- two-browser patient/clinician flow uses the correct stable session;
- polling never switches the clinician’s record;
- queue, claim, edit, stale review, sign, reload receipt, partial write, replay, and signed-elsewhere states are tested;
- keyboard-only reviewer can claim, navigate evidence, decide, edit, preview, sign, inspect receipt, and move to the next patient;
- no clinical state or origin is represented only by color or animation.

## Phase 7 — Performance and production hardening

### Bundle and rendering work

- Dynamically import Deepgram or Gemini after consent and selected mode; do not eagerly bundle both.
- Lazy-load CallLog, raw FHIR, sponsor traces, and demo diagnostics.
- Extract a client-safe pure FHIR projection/preview for `/prove`; do not import the server transaction and Medplum adapter path into that route.
- Use server components where interaction is unnecessary.
- Minimize data serialized across server/client boundaries.
- Evaluate `LazyMotion`/`m` for the small set of remaining animations.
- Remove unused Lucide imports and motion code.
- Keep expensive derived visualization work memoized and stable.
- Preserve focus, scroll, and selected case during background updates.

### Testing infrastructure

Add the smallest useful stack if not present:

- Testing Library with a DOM environment for component behavior;
- axe integration for automated accessibility checks;
- Playwright for route-level responsive, keyboard, state, and screenshot verification;
- a documented visual QA matrix rather than a fragile screenshot dump.

Do not add a test library without using it for production gates in this run.

### Required checks

1. Full unit suite.
2. TypeScript checking.
3. Production build.
4. Automated accessibility scan with zero serious/critical findings.
5. Keyboard-only patient and clinician golden paths.
6. 320, 390, 768, 1024, and 1440px layouts.
7. 200% zoom and long identifiers.
8. Light, dark, RTL, reduced-motion, offline, and delayed-hydration screenshots.
9. JavaScript-disabled baseline for essential content.
10. Two-browser patient-to-clinician workflow.
11. Voice permission denied and text fallback.
12. Chart, eligibility, session sync, and signing failure.
13. Stale review, partial FHIR write, idempotent replay, and receipt reload.
14. Print view of signed clinician brief.
15. Bundle and Core Web Vitals before/after evidence.

Performance targets:

- do not increase first-load JavaScript on any route;
- reduce home and `/prove` by at least 25% where feasible;
- reduce patient and clinician by at least 20% where feasible;
- target 75th-percentile LCP ≤2.5s, INP ≤200ms, and CLS ≤0.1;
- record measured results rather than claiming success from code inspection.

## Phase 8 — Hackathon differentiators after the product is trustworthy

Do not start this phase while a P0 truth, responsive, accessibility, workflow, or hydration issue remains. These ideas are ranked; implement them in order only while they strengthen the same patient-to-clinician story. Do not create a disconnected feature carousel.

### 8.1 “Why this question?”

Add a quiet disclosure beside every chart-conditioned follow-up:

- show the minimum chart fact that caused the question;
- identify its source and date;
- explain the reason in patient-safe language;
- never expose unrelated chart content;
- render a useful generic explanation when the chart is unavailable;
- record the linkage in the clinician evidence spine.

Example:

> Why I’m asking: your medication list shows lamotrigine was started 18 days ago. New skin symptoms can be important for your care team to review.

Do not turn this into diagnosis or advice. The visual transition may connect the chart node to the question once in 220ms; reduced motion shows the connection instantly.

Why it wins: the product’s chart-awareness becomes visible at the exact moment it helps instead of remaining an architecture claim.

### 8.2 Counterfactual delta view

Extend `/prove` with a compact `What changed?` comparison after a judge changes one fact:

- before value;
- after value;
- affected evidence node;
- previous outcome;
- recomputed outcome;
- unchanged facts explicitly collapsed as unchanged;
- stable rule identifier and local execution time.

Only changed nodes receive the one-time background wash. Provide `Copy proof summary` using synthetic, non-PHI content and a print-friendly view.

Why it wins: a judge can verify non-scripted behavior in less than 30 seconds.

### 8.3 Trust receipt / proof packet

Turn the existing receipt into a concise, printable evidence packet:

- synthetic/demo or production origin at the top;
- patient statements, chart facts, payer facts, inferences, and clinician edits separated;
- safety-coverage status;
- approve/edit/reject decision for every generated item;
- proposed versus persisted FHIR resources;
- per-resource IDs and write states;
- partial/replayed/failed status;
- clinician, time, canonical version, and idempotency key;
- plain-language `What Prologue did not do` boundary.

The on-screen packet is useful to a clinician; the print view is useful to judges and implementation partners. Never expose raw secrets, tokens, unnecessary identifiers, or PHI in a share/copy action.

Why it wins: sponsor depth and human authority become visible artifacts instead of spoken claims.

### 8.4 Visit-readiness checklist, not a black-box score

Create a transparent readiness panel with observable categories:

- reason for visit captured;
- relevant medication timing captured;
- medication-taking discrepancy needs review;
- safety screening performed, not supported, or failed;
- benefit fields returned, missing, or unavailable;
- patient review complete;
- clinic review pending, claimed, or signed.

Do not invent a percentage, risk score, or “ready” label from hidden weights. Each row links to its evidence and next action.

Why it wins: the product wedge—turning an appointment slot into prepared work—becomes legible without another clinical algorithm.

### 8.5 Synthetic scenario gallery

Only after the Maria path is reliable, add at most two additional synthetic scenarios that use the same production path:

1. **Medication reconciliation:** prescribed medication versus patient-reported use differs; Prologue preserves both and requests clinician review rather than overwriting either.
2. **Incomplete benefits response:** the payer returns partial data; Prologue names missing fields and refuses to estimate a price.

Requirements:

- label every scenario synthetic;
- reset server and browser state deterministically;
- show which product invariant the scenario proves;
- keep one-click negative controls;
- add engine, API, UI, and receipt tests;
- do not add a scenario whose impressive outcome depends on mocked client-only state.

Why it wins: judges can see that the trust architecture generalizes beyond one rehearsed story.

### 8.6 Demo conductor

Add a demo-only drawer, excluded or authorization-gated in production, with:

- reset current synthetic case;
- switch scripted/live voice path with honest origin labels;
- show network/integration status;
- intentionally demonstrate a labeled fallback;
- jump to the patient, queue, selected case, and challenge surfaces;
- show a compact four-minute progress cue visible only to the presenter;
- restore a known-good state without mutating clinical rules.

Do not let this drawer compete with patient or clinician tasks. Do not hide a failed live integration behind an automatic unlabeled switch.

Why it wins: the demo stays reliable while making degradation behavior part of the product argument.

### 8.7 Product-learning instrumentation

Define privacy-safe events for a pilot without sending transcript or PHI in analytics:

- intake started/completed/abandoned;
- voice selected, text selected, permission denied, and fallback used;
- patient correction count, never correction content;
- chart/eligibility origin and failure category;
- queue wait, claim, review, and sign durations;
- number of generated items approved, edited, rejected, or left undecided;
- write fully persisted, partial, failed, or replayed;
- challenge preset/manual change and result category.

Keep analytics disabled unless configured, document the schema and retention boundary, and make demo metrics explicitly synthetic. Do not put unmeasured metrics on the homepage.

### Phase 8 selection rule

If hackathon time is limited, complete 8.1–8.3 and stop. They reuse the core evidence model and produce the strongest visible proof. Add 8.4–8.7 only after another full rehearsal still completes with at least 30 seconds of margin.

## Copy system

Write like a calm clinical operations product.

Prefer:

- `Chart available` / `Chart unavailable`;
- `Using a scripted synthetic scenario`;
- `Not automatically screened`;
- `Flag queued for clinic review`;
- `Benefits returned by the plan`;
- `Some benefit fields were not returned`;
- `Needs a decision`;
- `Sign reviewed brief`;
- `Written to Medplum` / `Saved in demo session only` / `Write incomplete`;
- `Prologue declined to infer because…`.

Avoid:

- `AI-powered`, `intelligent`, `smart`, `seamless`, `revolutionary`;
- `nothing found` when evaluation did not run;
- `office notified` when only local state changed;
- `recording` when no audio capture occurs;
- `coverage active` when payer status is inactive or unknown;
- `price`, `will cost`, `approved`, or `prior authorization not required` from 271 data;
- `success` when persistence is partial or fixture-only.

Use clinical/technical terms in clinician and evidence layers; translate them into plain language for patients. Never hide uncertainty behind reassuring tone.

## Motion storyboard for the four-minute demo

1. Home evidence chain appears once after readable content—no more than 340ms.
2. Patient statement enters in 160ms and becomes stable.
3. The chart fact is added to the provenance spine.
4. The risk window sweeps once; the symptom marker lands; the connection becomes visible.
5. The urgent state appears instantly without pulse.
6. Queue row receives one brief edge highlight and remains stable.
7. Clinician decisions stamp in place without bounce.
8. FHIR diff changes only where a decision changed.
9. On server confirmation, the receipt unfolds and focus moves to it.
10. `/prove` changes one fact; only the changed value and affected causal nodes update.

The reduced-motion version shows the same information immediately with no transforms or path drawing.

## Completion criteria

Do not call the work complete because the pages look more modern.

Complete only when:

- the visual system is implemented consistently across all four routes;
- the homepage makes `/prove` discoverable;
- the patient journey has review, submit, failure recovery, and truthful status;
- the clinician has a stable queue/detail experience and explicit edit support;
- the receipt is canonical after reload;
- no essential content depends on hydration or motion;
- every required state has intentional UI and at least one verification path;
- responsive layouts pass at all required widths and 200% zoom;
- keyboard, screen-reader smoke, RTL, dark, reduced-motion, and offline checks pass;
- all clinical and data-origin claims remain truthful;
- tests, typecheck, and production build pass;
- first-load JavaScript and Web Vitals do not regress;
- three consecutive four-minute rehearsals complete without manual repair.

If time is constrained, cut in this order:

1. dark-theme flourish beyond a fully accessible basic dark theme;
2. nonessential page-arrival choreography;
3. optional keyboard shortcuts;
4. print embellishment;
5. decorative texture.

Never cut:

- truthful state copy;
- essential content before hydration;
- responsive patient/proof/clinician layouts;
- visible focus and semantic controls;
- reduced-motion behavior;
- safety-coverage labeling;
- stable clinician session selection;
- explicit decisions and FHIR preview;
- live/fixture/failed origin honesty;
- recoverable loading/error/degraded states.

## Final handoff

Finish with:

1. outcome and design rationale;
2. before/after screenshots for home, patient, clinician, and proof at mobile and desktop;
3. implemented token, typography, component, motion, and responsive systems;
4. state matrix coverage;
5. accessibility results and manual checks;
6. test, typecheck, and build results;
7. before/after bundle and Web Vitals measurements;
8. what is live, fixture, cached, failed, or unverified;
9. remaining production risks;
10. exact four-minute demo script;
11. next three UX bets ranked by user value, trust value, effort, and risk.

Do not stop at a design review while safe in-scope implementation work remains. Leave the repository in a demonstrable, tested, production-quality state.

## Standards anchors

- WCAG 2.2 target size: <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>
- WCAG focus appearance: <https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html>
- WCAG animation from interactions: <https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html>
- WCAG non-text contrast: <https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html>
- Motion reduced-motion guidance: <https://motion.dev/docs/react-accessibility>
- NHS accessibility guidance: <https://service-manual.nhs.uk/accessibility/design>
- Next.js font optimization: <https://nextjs.org/docs/app/getting-started/fonts>
- Core Web Vitals thresholds: <https://web.dev/articles/vitals>

---
