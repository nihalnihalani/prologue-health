# Prologue UI/UX production specification

Status: implementation reference

Audited revision: `fbdbbbb` on 2026-08-02

Audience: product design, frontend engineering, clinical-safety review, accessibility review, and demo direction

This specification defines how Prologue should look, feel, move, explain itself, and behave across patient, clinician, and judge-facing surfaces. It does not replace `CLAUDE.md` or the product safety model. If visual polish conflicts with clinical truth, accessibility, or canonical state, truth wins.

## 1. Design thesis

### The Living Casefile

Prologue should feel like a beautifully typeset clinical casefile updating in real time—not a chatbot, generic EHR dashboard, or glowing AI assistant.

Its signature visual is a provenance spine connecting:

`patient statement → chart fact → deterministic inference → clinician decision → durable receipt`

The interface should make that chain visible without requiring an architecture explanation. A judge should remember the evidence spine and medication timeline. A patient should remember a calm conversation and a clear next step. A clinician should remember that every generated assertion remained inspectable and under human authority.

### Product personality

- Calm, exact, humane, and editorial.
- Serious without feeling institutional.
- Technical evidence is available, but never dominates the care task.
- Urgency is communicated through hierarchy and language, not alarm animation.
- Warm paper, deep ink, and stamped semantic colors replace generic slate-and-teal SaaS styling.
- Real product data and state transitions provide the visual interest; no stock doctors, AI orbs, glassmorphism, decorative dashboards, or abstract gradients.

### Five visual principles

1. **Consequence before capability.** Lead with what changed for this visit, then explain the technology.
2. **Trust is visible structure.** Patient, chart, payer, inference, and clinician facts never collapse into one visual blob.
3. **Motion explains causality.** Animation connects changed facts to changed outcomes; it never performs urgency or distracts from reading.
4. **One surface, one primary job.** Patient care content, clinician work, and demo diagnostics have separate visual layers.
5. **The interface never outruns canonical state.** Delivery, acknowledgement, signing, persistence, and live integration copy appear only after their actual events exist.

## 2. Current-state audit

### What is already worth preserving

- The same `StoryMap` feeds patient and clinician views.
- Provenance classes exist and are already represented in shared components.
- `/prove` uses the production conversation and deterministic clinical engine.
- Clinician signing is server-authoritative and every promotable inference requires an explicit decision.
- The receipt model can distinguish written, failed, fixture, and partial resource outcomes.
- Framer Motion and Lucide are installed, so the product does not need another motion or icon library.
- The application currently passes 95 unit tests, strict TypeScript checking, and a production build at the audited revision.

### P0 production blockers

1. **Essential content begins invisible.** Several top-level Framer elements SSR with `opacity: 0`, scale zero, or width zero and only become visible after hydration. A client failure can leave an empty home, patient screen, timeline, or casefile. Essential content must render visible before JavaScript; motion is progressive enhancement.
2. **Reduced motion is incomplete.** CSS shortens CSS transitions, but Framer transforms, spring motion, stagger sequences, and infinite pulses are not governed by an app-level reduced-motion policy.
3. **The responsive system is missing.** There are no layout breakpoints. At a measured 390px viewport, `/prove` expanded to 558px and preset labels overlapped. The clinician view keeps a fixed 420px secondary column and the sticky receipt can cover a mobile viewport.
4. **Clinical state copy gets ahead of reality.** The escalation component promises that an office or nurse will call before acknowledgement exists. “Recording” appears in scripted mode. The benefits component says data came directly from a payer even when showing a fixture.
5. **Accessibility semantics are incomplete.** Dynamic status changes have no live regions; non-button focus is inconsistent; presets and decisions have no selected-state semantics; the timeline has no text/table equivalent; document language remains English; several status color pairs fail WCAG AA.
6. **Safety coverage is invisible.** Non-English intake can look equivalent to English screening even when deterministic safety rules were not run for that language.
7. **The clinician screen is not a queue.** It polls the latest session and can replace the review context instead of keeping a stable selected session.
8. **The interface mixes product and demo layers.** Patients see provider names, latency, scripted controls, fixture chips, and “Under the hood” beside care content. The production path needs calm task-focused UI; demo evidence belongs in a labeled disclosure.

### P1 quality gaps

- The current palette is a generic slate/teal admin palette. Teal means primary action, patient source, live data, final status, and success.
- Inter is named in CSS but not actually loaded; typography falls back to system UI.
- Repeated cards, pills, shadows, and small mono labels create “card soup” and flatten reading order.
- `/prove` did not receive the latest visual treatment and is not linked from the homepage.
- Home contains unsupported claims: “improve accuracy” and “average intake <3 minutes.”
- Patient completion sends the patient to the clinician view instead of review, submit, and receipt.
- Changing language resets an active session without confirmation.
- The patient flow has no text-first alternative, editable read-back, sync failure state, or canonical reviewed state.
- The clinician UI supports approve/reject but not the backend’s edit decision or a pre-write FHIR diff.
- The detailed receipt expands inside a sticky signing bar instead of becoming a readable post-sign surface.
- Benefits use large dollar figures that visually resemble a price quote.
- Timeline markers rely on color and `title` tooltips and are hard to read at small sizes.
- Inline styles dominate, making responsive, RTL, focus, density, and theme behavior difficult to enforce.
- The patient route eagerly includes both Gemini and Deepgram paths. Approximate uncompressed first-load JavaScript at the audited revision is 647 KB for home, 701 KB for clinician, 868 KB for `/prove`, and 1.09 MB for patient.

## 3. Color system

### Theme policy

Use the light “clinical paper” theme as the predictable default for the demo and first production release. Offer an explicit theme control with `Light`, `Dark`, and `System`; store the choice. Read system preference only on first visit. Never let a projector or operating-system setting silently change the demo appearance.

Use semantic foreground/background/border tokens rather than raw colors in components. Color must never be the only status or provenance signal.

### Light theme: Clinical Paper

| Token | Value | Purpose |
|---|---:|---|
| `--canvas` | `#F3F0E8` | Warm page background |
| `--surface` | `#FFFDF8` | Primary casefile surface |
| `--surface-raised` | `#FFFFFF` | Menus, dialogs, signing dock |
| `--surface-sunken` | `#E9EDE8` | Inputs, secondary strips, inactive rows |
| `--ink` | `#18211D` | Primary text |
| `--ink-secondary` | `#44504A` | Supporting text |
| `--ink-muted` | `#626E68` | Metadata; do not use below 12px |
| `--line` | `#C9D0CA` | Default rules and panel boundaries |
| `--line-strong` | `#98A49E` | Inputs, dividers, selected outlines |
| `--action` | `#1F526B` | Primary action and links |
| `--action-hover` | `#163E52` | Primary hover/pressed |
| `--action-soft` | `#DCE9ED` | Selected/secondary action surface |
| `--focus` | `#007C89` | Keyboard focus ring |
| `--focus-soft` | `#B7DCE1` | Outer focus halo |
| `--critical` | `#A4372A` | Confirmed urgent/failed state only |
| `--critical-soft` | `#F5DFDB` | Critical surface |
| `--warning` | `#8C5C0A` | Incomplete, unknown, attention |
| `--warning-soft` | `#F5E8C8` | Warning surface |
| `--approved` | `#2E664F` | Clinician-approved/completed |
| `--approved-soft` | `#DCE9E1` | Approved surface |
| `--info` | `#365E8D` | Record/informational state |
| `--info-soft` | `#E0E8F1` | Informational surface |

Contrast intent on the light canvas or surface:

- `--ink`: approximately 14.5:1.
- `--ink-secondary`: approximately 7.4:1.
- `--ink-muted`: approximately 4.67:1.
- White on `--action`: approximately 8.48:1.
- `--critical` on `--critical-soft`: approximately 5.21:1.
- `--warning` on `--warning-soft`: approximately 4.73:1.

Recheck actual rendered pairs after implementation; these values do not excuse testing.

### Provenance colors

| Source | Foreground | Soft surface | Glyph |
|---|---:|---:|---|
| Patient | `#0B6B66` | `#DCEDEA` | Quotation mark |
| Record | `#365E8D` | `#E0E8F1` | Chart page |
| Inference | `#78551F` | `#F1E7D2` | Linked facts |
| Insurance | `#6F5C27` | `#EFE9D7` | Benefits document |
| Clinician | `#674478` | `#EDE4F0` | Signed check |

Inference is bronze, not glowing purple. Every source indicator includes a glyph and a text label. A grayscale screenshot must remain understandable.

### Optional dark theme: Night Chart

| Token | Value |
|---|---:|
| `--canvas` | `#101512` |
| `--surface` | `#171D19` |
| `--surface-raised` | `#1D2520` |
| `--surface-sunken` | `#121714` |
| `--ink` | `#F5F2E9` |
| `--ink-secondary` | `#CDD4CD` |
| `--ink-muted` | `#98A39C` |
| `--line` | `#3B463F` |
| `--line-strong` | `#58655D` |
| `--action` | `#8DC5D5` |
| `--action-hover` | `#B5DAE3` |
| `--action-soft` | `#203C45` |
| `--focus` | `#7FD4DE` |
| `--critical` | `#FF9584` |
| `--critical-soft` | `#47231F` |
| `--warning` | `#E4BB68` |
| `--warning-soft` | `#40341F` |
| `--approved` | `#8BC2A3` |
| `--approved-soft` | `#20382C` |

Dark mode is not complete until all text, focus, chart, disabled, hover, selected, and semantic pairs pass contrast checks.

## 4. Typography

Use `next/font` so fonts are optimized and self-hosted by the build with no browser request to a third party.

- **Brand/display:** `Literata` variable, weight 500–650. Use for the Prologue wordmark, major narrative headings, and humane patient callouts.
- **Body/UI:** `Atkinson Hyperlegible Next` 400/700. If that exact family is unavailable in the installed Next font catalog, use `Atkinson Hyperlegible` or self-host licensed WOFF2 files.
- **Evidence/data:** `IBM Plex Mono` 400/500 for timestamps, rule IDs, FHIR identifiers, latency, and compact metadata only.

Do not set entire panels or long paragraphs in monospace.

### Type scale

| Role | Desktop | Mobile | Notes |
|---|---:|---:|---|
| Display | 56/60 | 40/44 | Home consequence statement only |
| Page title | 32/36 | 28/32 | One H1 per route |
| Section title | 18/24 | 18/24 | Strong but compact |
| Patient body | 17/26 | 17/26 | Conversation and instructions |
| Clinician body | 14/20 | 15/22 | Dense but readable |
| UI/control | 14/20 | 16/22 | Avoid mobile zoom on fields |
| Metadata | 11/16 | 12/16 | Uppercase only for short stamps |

Use tabular numerals for dates, timers, latency, and counts. Keep text measures near 65–75 characters for long reading. Support 200% zoom without clipping or loss of content.

## 5. Geometry and elevation

- Use a 4px base spacing scale: `4, 8, 12, 16, 24, 32, 48, 64`.
- Patient reading width: 680px maximum.
- Clinician workspace: 1440px maximum on a 12-column grid.
- Controls and source stamps: 4px radius.
- Panels: 8px radius.
- Modal, drawer, and signing dock: 14px radius.
- Reserve full pills for binary status or compact live/fixture origin—not every label.
- Default panels have a 1px rule and no shadow.
- Floating layers may use:

```css
box-shadow:
  0 16px 48px rgba(24, 33, 29, 0.14),
  0 2px 8px rgba(24, 33, 29, 0.08);
```

- Focus ring:

```css
outline: 2px solid var(--focus);
outline-offset: 3px;
box-shadow: 0 0 0 3px var(--focus-soft);
```

Do not use `transition: all`. Transition only the properties that should change.

## 6. Iconography, diagrams, and data visualization

- Keep Lucide for utility actions only. Standardize stroke width at 1.75 and sizes at 16, 20, and 24px.
- Decorative icons use `aria-hidden="true"`; icon-only buttons require an accessible name and visible tooltip on hover/focus.
- Create simple provenance glyphs for patient quote, chart page, linked facts, benefits document, and clinician signature.
- Use the actual evidence chain and medication timeline as the hero visual. Do not add an abstract AI illustration.

### Timeline visual grammar

- Deep ink axis and readable date/day labels.
- Inky-blue medication track.
- Amber hatched risk window with a visible label.
- Vermilion diamond for symptom onset.
- Black vertical “today” rule where relevant.
- Visible start, onset, risk-window, and elapsed-time labels.
- Pattern and shape differences so the chart survives color blindness and monochrome printing.
- A semantic text or table equivalent adjacent to the visualization.
- No critical information available only through hover or a `title` attribute.

## 7. Motion system

Motion has three allowed jobs:

1. preserve spatial continuity;
2. explain that a fact changed an outcome;
3. confirm an intentional user action.

### Global contract

- Add one app-level `MotionConfig reducedMotion="user"`.
- Use `useReducedMotion` when an interaction needs a bespoke non-motion alternative.
- Essential, urgent, loading, and error content starts visible. Prefer `initial={false}` or server-visible markup.
- Never make SSR content depend on hydration to become legible.
- Prefer opacity and a maximum 6px translation.
- Use CSS for simple hover/focus transitions and Framer only for meaningful state choreography.
- Hoist typed variants outside render functions; remove `any` motion variants.
- No layout thrashing, width/height animation, large parallax, blur animation, or continuously moving backgrounds.

### Motion tokens

| Token | Value | Use |
|---|---:|---|
| `--motion-instant` | 80ms | Pressed state |
| `--motion-fast` | 140ms | Approval stamp, compact disclosure |
| `--motion-base` | 180ms | Transcript row, selection |
| `--motion-slow` | 240ms | Drawer/receipt |
| `--motion-story` | 420ms | One-time timeline explanation |
| `--ease-standard` | `cubic-bezier(.2,.8,.2,1)` | Most transitions |
| `--ease-emphasized` | `cubic-bezier(.16,1,.3,1)` | One-time causal reveal |

### Choreography

- Page arrival: one 340ms sequence—header 0–180ms, main content 60–240ms, evidence spine 120–300ms. Do not stagger every card.
- Transcript turn: 160ms opacity plus 4px movement; autoscroll only when the reader is already near the bottom.
- Correlation: risk band sweeps once over 420ms, symptom diamond appears over 120ms, connector resolves over 220ms.
- `/prove` fact change: changed value receives a 600ms soft background wash; only affected evidence nodes update.
- Decision: approve/edit/reject stamp settles in 140ms with no bounce.
- Receipt: unfolds once in 220ms and moves focus to its heading after signing.
- Queue: new items receive a brief non-looping edge highlight; resorting preserves row continuity.

### Forbidden motion

- Infinite pulsing urgent icons, recording dots when nothing is listening, bouncing CTAs, breathing cards, floating gradients, confetti, shaking errors, and springy clinical data.
- Hover scaling that changes layout or makes dense clinician controls move under the pointer.
- Delayed escalation or signing feedback.
- Replaying entrance animation on every 1.5-second poll.

### Reduced-motion behavior

Render final states immediately. Disable transforms, path drawing, pulsing, animated autoscroll, and route/page choreography. Retain instant color/border/text changes and clear focus movement. Verification must confirm zero looping animation under reduced motion.

## 8. Responsive, zoom, RTL, and input model

Validate at 320, 390, 768, 1024, and 1440px plus 200% browser zoom.

- Under 900px, clinician columns stack or become explicit `Queue`, `Case`, and `Evidence` tabs. Do not squeeze the casefile beside a 420px panel.
- At 768–1023px, clinician queue may become a collapsible rail; the selected case remains stable.
- On mobile, the detailed receipt is a drawer or normal-flow section, not an expanding sticky block.
- Reconciliation becomes labeled rows/cards rather than an unreadable three-column grid.
- FHIR IDs, citations, and provider errors wrap safely with `overflow-wrap: anywhere`.
- Patient actions use a bottom dock that respects `env(safe-area-inset-bottom)` and never covers content.
- Use logical CSS properties throughout; remove directional `marginLeft`, text-right assumptions, and fixed left/right animations.
- Update scoped `lang` and `dir` for the selected language. Test Arabic and a deliberately long-string pseudo-locale.
- All essential actions work by keyboard, touch, mouse, and text input. Do not require drag gestures for sliders; pair sliders with number inputs.
- Patient primary targets should be at least 48px high. All targets must meet WCAG 2.2 minimum size/spacing.

## 9. Shared application shell and design-system components

Do not adopt a large UI kit or migrate to Tailwind. Build a small local design system using semantic tokens and CSS modules or well-scoped global component classes.

Recommended primitives:

- `AppShell`, `AppHeader`, `DemoModeBar`, `SkipLink`;
- `Button`, `LinkButton`, `IconButton`, `ButtonGroup`;
- `Panel`, `SectionHeader`, `Inset`, `Divider`;
- `Badge`, `StatusBadge`, `SourceBadge`, `OriginBadge`;
- `Alert`, `InlineNotice`, `ToastRegion`, `LiveRegion`;
- `Field`, `SelectField`, `RadioGroup`, `SegmentedDecision`, `RangeWithInput`;
- `Skeleton`, `EmptyState`, `ErrorState`, `OfflineBanner`;
- `Drawer`, `Dialog`, `Disclosure`, `Tabs`;
- `ProgressSteps`, `WorkflowRail`, `EvidenceSpine`;
- `ReceiptList`, `ResourceStatus`, `FHIRDiff`;
- responsive `Stack`, `Cluster`, and `Grid` layout helpers.

Split the 510-line `StoryMap.tsx` by domain when useful, but preserve its audience filtering and provenance semantics. Reuse `Timeline`, `ItemRow`, `Reconciliation`, `BenefitsCard`, `CallLog`, and `EscalationCard`; improve their interface and presentation instead of rewriting clinical logic.

### State behavior rules

- Toasts are for transient, non-clinical confirmation only.
- Clinical alerts, integration failures, partial writes, and unsaved work remain visible until resolved.
- Focus moves intentionally after dialogs, submission, signing, or a blocking error.
- Loading, empty, error, degraded, and success are distinct states—not one blank panel.
- Skeletons match final geometry and never conceal critical failure information.
- Disabled actions explain why through nearby text; do not rely only on a tooltip.

## 10. Screen specifications

### Home: consequence-led product front door

Desktop composition: an editorial two-column cover.

Left:

- persistent top rule: `Synthetic demonstration · no real PHI`;
- Literata display statement: **“Maria’s Thursday visit shouldn’t wait.”**;
- one short explanation of chart-conditioned pre-visit readiness;
- primary CTA: `Start synthetic intake`;
- secondary CTA: `Challenge the engine` linking to `/prove`;
- tertiary text link: `Open clinician queue`.

Right:

- the actual compact evidence spine and timeline using the Maria fixture;
- three numbered beats: patient mentions rash, chart reveals recent lamotrigine, deterministic timing creates review work;
- clear draft/human-review boundary.

Remove “intelligent AI,” “improve accuracy,” and the unmeasured `<3 minutes` claim. If a metric is shown later, label it as a target or measured pilot result with provenance.

In production mode, replace persona-switching with authenticated entry points. In demo mode, preserve all three journeys but label role switching clearly.

### Patient: calm guided intake

Journey:

`verify appointment → choose language/mode → consent → conversation → review/correct → submit → receipt`

1. **Appointment cover**
   - Maria, Thursday appointment, clinic, reason, and a “not you?” exit.
   - Show chart status only after patient verification.
2. **Language and mode**
   - Treat language as a primary choice, not a settings afterthought.
   - Warn before a change resets an active intake.
   - Offer voice and text without making text feel like a degraded path.
   - Before consent, show whether deterministic safety screening is validated for this language.
3. **Consent**
   - State whether audio is streamed, recorded, or retained; name what is stored.
   - Explain provider processing, stopping, withdrawal, and text alternative.
   - Do not create an NPP acknowledgement unless the notice was actually presented and accepted.
4. **Conversation**
   - One calm dictation surface with a large state label: connecting, listening, processing, paused, disconnected, or scripted demo.
   - Never say “Recording” in scripted or idle mode.
   - Partial transcript is visibly provisional; confirmed transcript is stable.
   - New turns announce through a polite live region without interrupting speech.
   - Voice provider, latency, rule IDs, fixture labels, and CallLog live inside a collapsed `Demo evidence` disclosure.
5. **Safety event**
   - Calm oxide side rule, direct language, and explicit current state.
   - `Flag queued for clinic review` before acknowledgement.
   - `Received by [role] at [time]` only when that event exists.
   - Never promise a call, disposition, or response time that canonical state does not record.
6. **Review and correction**
   - Editable “Here’s what I heard” summary before submission.
   - Preserve original and correction history.
   - Separate patient statement, record fact, and system inference visually.
7. **Completion**
   - Submit progress, canonical queue state, and a plain-language receipt.
   - Patient does not navigate into the clinician workspace in production.
   - Later states: sent, being reviewed, reviewed by named clinician, Task acknowledged, or follow-up recorded—only when true.

### Clinician: queue plus continuous casefile

Desktop composition:

- 280px queue rail;
- flexible central casefile;
- 360px sticky evidence rail.

Queue:

- loading, empty, error, unassigned, assigned-to-me, assigned-elsewhere, and signed states;
- urgency, patient, appointment, language/safety coverage, wait time, assignment, and last update;
- stable session selection by ID;
- explicit claim/release and visible ownership;
- filters for `Needs review`, `Mine`, and `Completed`;
- polling or updates never replace the active case;
- stale update indicator rather than silent rerender.

Casefile:

- urgent Task/status first;
- one continuous provenance spine connecting patient quote, record fact, inference, and decision;
- “what matters now” summary before technical detail;
- original-language patient statement with explicit translation/original labels;
- prominent `Not automatically screened—review original transcript` when coverage is unavailable;
- enlarged timeline beside its textual explanation;
- medication reconciliation as readable comparison rows;
- eligibility as a sober returned-benefits table with an always-visible `Benefits, not a price quote` banner.

Review controls:

- approve/edit/reject as a keyboard-accessible radio group for each promotable item;
- no default selection;
- edit reveals a field, preserves original text, and identifies clinician authorship;
- FHIR diff preview before attestation;
- signing blocked until all decisions are complete and the canonical version matches;
- button label `Sign reviewed brief`, even when some findings were rejected;
- signed packet is read-only.

Signing and receipt:

- concise signing dock with decision counts and clear blocker text;
- attestation confirmation dialog describing what will be written;
- progress state with no optimistic finality;
- after signing, open a receipt drawer or dedicated section;
- show per-resource ID, status, origin, failure, replay state, and partial-write recovery;
- receipt survives reload;
- primary next action becomes `Next patient` or `Return to queue`.

### Challenge Prologue: judge-controlled causal lab

Desktop:

- left column: three presets and precise controls;
- right column: outcome headline and numbered evidence chain;
- full-width timeline below.

Mobile:

- presets wrap normally and occupy full width;
- outcome appears immediately after controls;
- no horizontal page overflow at 320px;
- timeline has a compact text equivalent before the visual.

Interaction requirements:

- Fix `.btn` inheritance so preset content uses `white-space: normal`, column layout, and left alignment.
- Presets expose selected state with `aria-pressed` or a radio group.
- Pair range inputs with numeric inputs for precise keyboard changes.
- On every change, state exactly what changed and why the outcome changed.
- Distinguish four results: correlation fired, timing outside window, symptom predates medication, and unsupported drug.
- “Declined to infer” is a positive calibrated result, not a gray empty state.
- Do not use a red border merely because a correlation fired; red is reserved for confirmed urgency/failure.
- Announce the outcome through a polite live region.
- Label engine latency as local deterministic rule time, not network or full-intake latency.
- Keep raw FHIR and rule details behind progressively disclosed evidence.

## 11. Required state matrix

| Surface | Observable states |
|---|---|
| Global | route loading, route error, not found, offline, reconnecting, recovered |
| Patient boot | chart warming, live chart, fixture chart, chart unavailable, retry, basic-intake fallback |
| Consent | not started, accepted, declined, text-only, revoked |
| Conversation | connecting, listening, processing, paused, mic denied, provider failed, scripted demo |
| Transcript | empty, partial, confirmed, correcting, corrected, sync pending, saved, offline/failed |
| Safety | screened-clear, rule matched, screening unavailable, evaluation failed |
| Eligibility | checking, live complete, live partial, fixture, inactive, failed |
| Patient completion | review required, submitting, submitted, clinic queued, clinic acknowledged, reviewed |
| Clinician queue | loading, empty, error, populated, assigned to me, assigned elsewhere, completed |
| Review | unclaimed, claimed, stale, undecided, edited, ready to sign, signed elsewhere |
| Finalization | confirming, signing, fully persisted, local demo only, partial, failed, replayed |
| Signed packet | durable read-only receipt, retry/reconciliation needed |
| Proof | fired, outside window, symptom predates drug, unsupported drug |

Every state needs intentional copy, iconography, focus behavior, retry/next action, data-origin labeling, and a test. Do not create fake frontend state to fill the matrix; extend canonical state when necessary or mark the state unavailable.

## 12. Accessibility requirements

Target WCAG 2.2 AA across patient, staff, and demo surfaces. Aim higher for focus visibility and important controls.

- At least 4.5:1 contrast for normal text and 3:1 for large text and essential non-text UI.
- Visible focus on every interactive element, not only `.btn`.
- At least 24×24 CSS pixel targets or compliant spacing; use 44–48px for important controls.
- Skip link and semantic page landmarks.
- Logical heading hierarchy and descriptive page titles.
- `role="alert"` for blocking errors/urgent failures; `role="status"` or `aria-live="polite"` for progress and non-urgent updates.
- No status communicated by color, motion, icon, or position alone.
- Accessible names for icon-only controls and visible text alternatives for diagrams.
- Preset and decision controls expose programmatic selected state.
- Focus is not obscured by sticky docks and returns correctly after dialogs/drawers.
- Timeline, provenance chain, and receipts make sense with CSS disabled and through a screen reader.
- Patient content uses the selected language and direction; technical identifiers may preserve their source language.
- Keyboard-only completion of patient, queue, review, proof, and signing flows.
- VoiceOver smoke tests on Safari plus a second desktop screen reader.
- Test at 200% zoom and with reduced motion, forced colors/high contrast, dark mode, and Arabic RTL.

Do not add an accessibility overlay widget. Accessibility must be built into components and tested with assistive technology.

## 13. Frontend architecture and performance

### Server/client boundaries

- Keep home server-rendered; isolate any entrance choreography in a small optional motion island or CSS progressive enhancement.
- Minimize data serialized into client components.
- Dynamically import Gemini and Deepgram only after consent and selected mode; never eagerly ship both paths to every patient.
- Extract a client-safe pure FHIR preview so `/prove` does not import server transaction and Medplum adapter code.
- Dynamically load CallLog, raw FHIR, sponsor trace, and other demo-only drawers when opened.
- Consider `LazyMotion`/`m` if it materially reduces the shared Motion bundle.
- Import icons directly and remove unused icons.

### Rendering behavior

- Critical content remains visible before hydration.
- Avoid animation-driven layout shifts.
- Preserve scroll and focus when polling updates arrive.
- Memoize expensive derived visualization data, not simple markup.
- Use `content-visibility` carefully for long offscreen clinician lists.
- Do not animate SVG elements directly when a wrapper transform is sufficient.

### Performance gates

- No route’s first-load JavaScript increases from the audited baseline.
- Target at least 25% reduction on home and `/prove`, and at least 20% on patient and clinician.
- At the 75th percentile, target LCP ≤2.5s, INP ≤200ms, and CLS ≤0.1 on mobile and desktop.
- Record before/after bundle and Web Vitals evidence; do not claim improvement without measurement.
- Custom fonts must use `next/font`, variable fonts where possible, limited subsets, and no client runtime font request.

## 14. Verification matrix

Automated:

- existing unit suite, strict TypeScript, and production build;
- Testing Library component tests for primitives and stateful domain components;
- axe checks with zero serious or critical violations;
- Playwright golden paths for `/`, `/prove`, `/patient`, and `/clinician`;
- screenshots at 390, 768, and 1440px for light, dark, RTL, and reduced motion;
- no horizontal overflow at 320/390px or 200% zoom;
- critical content present before hydration and with JavaScript unavailable;
- zero looping transform animation under reduced motion;
- fixture/live/cache/failed/unknown labels match the underlying state;
- route bundle regression checks.

Manual:

- keyboard-only patient and clinician flows;
- VoiceOver on Safari;
- iOS Safari microphone permission, denial, keyboard, and safe-area behavior;
- Android Chrome voice/text fallback;
- two-browser patient-to-clinician handoff;
- network loss during chart load, voice, eligibility, session sync, and signing;
- stale review, signed-elsewhere, partial write, replay, and receipt reload;
- projector/readability check from presentation distance;
- print-friendly signed clinician brief.

## 15. Ranked product and hackathon opportunities

These are not substitutes for the production blockers. Add them only after the truthful state model, responsive layouts, accessibility, stable queue, and canonical receipt work end to end.

| Rank | Addition | User value | Judge value | Relative effort | Guardrail |
|---:|---|---|---|---|---|
| 1 | `Why this question?` provenance | Patients understand relevance | Proves chart-conditioning in context | Small | Reveal only the minimum relevant chart fact |
| 2 | Counterfactual delta view | Makes decisions explainable | Proves non-scripted recomputation quickly | Small | Reuse production logic; no demo-only branch |
| 3 | Printable trust receipt | Clear durable handoff | Makes sponsor depth and authority tangible | Medium | Exclude secrets and unnecessary PHI |
| 4 | Evidence-linked readiness checklist | Shows what remains before the visit | Clarifies the workflow wedge | Medium | No opaque readiness or risk score |
| 5 | Two additional synthetic scenarios | Demonstrates generality | Reduces one-fixture skepticism | Large | Same engine, server state, and tests |
| 6 | Demo conductor | Reliable rehearsals and fallbacks | Keeps the four-minute story on track | Medium | Demo-only and visibly separated |
| 7 | Privacy-safe pilot telemetry | Reveals friction and workflow time | Strengthens the product/pilot story | Medium | Never send transcript or PHI in analytics |

### Why this question?

Every chart-conditioned follow-up should offer a compact disclosure showing the minimum chart fact, date, source, and plain-language reason that caused it. The corresponding clinician evidence node should preserve the same linkage. It must not reveal unrelated chart facts or cross into diagnosis or advice.

### Counterfactual delta

After a judge changes one fact, `/prove` should show before/after value, previous/recomputed outcome, affected evidence node, stable rule identifier, and local execution time. Collapse unchanged facts. Provide a synthetic-safe copy/print summary. Animate only the changed node.

### Trust receipt

The post-sign receipt should become a readable proof packet containing origins, safety coverage, explicit decisions, clinician edits, proposed/persisted resource differences, write IDs and states, canonical version, time, and a concise statement of what Prologue did not do.

### Readiness checklist

Show observable readiness facts—reason captured, medication timing captured, discrepancies needing review, safety evaluation coverage, payer fields returned/missing, patient review, and clinic review. Do not synthesize these into an unsupported percentage or score.

### Scenario gallery

After the Maria scenario is stable, add no more than two fixtures through the same real path: a prescribed-versus-reported medication discrepancy and an incomplete payer response. Each scenario names the invariant it proves, includes a negative control, resets deterministically, and has engine-to-receipt tests.

### Demo conductor and telemetry

Keep reset, route jumps, integration status, scripted/live selection, intentional labeled fallback, and presenter timing in a demo-only drawer. Define pilot events without transcript content or PHI; never display synthetic or unmeasured telemetry as a production outcome.

## 16. Definition of production-level UI

The UI is not production-level because it has more animation, more shadows, or more components. It is production-level when:

- users always know where they are, what the system knows, what it does not know, and what happens next;
- every async operation has a truthful state and recovery path;
- every clinical assertion shows its source and authority;
- the same story works on phone, desktop, keyboard, screen reader, RTL, reduced motion, and failed network;
- essential content never waits for animation or hydration to become visible;
- the visual identity is unmistakably Prologue because it expresses the evidence chain;
- the four-minute demo is beautiful because the real workflow is clear, not because the UI performs around it.
