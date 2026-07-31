# Prologue hackathon rubric

Use this rubric to choose work, review implementation, and rehearse the demo. It is an evaluation reference, not a requirement to add every possible feature.

Score each dimension from 0–5, then apply the weight. A 3 is credible and demonstrable; a 5 is undeniable under judge interaction.

| Dimension | Weight | A 5 looks like |
|---|---:|---|
| Clinical trust | 25 | Provenance is separated, uncertainty is visible, every generated item gets an explicit decision, failures remove claims, and no diagnosis, treatment, or invented payer value reaches the patient. |
| Non-scripted proof | 20 | A judge changes one fact; the question, rule trace, inference, and FHIR proposal recompute through the production engine. A negative control visibly declines to infer. |
| Workflow outcome | 20 | A routine intake becomes an urgent clinical `Task`, enters a real queue, is reviewed, and produces a canonical receipt. The patient only sees outcomes the clinic actually confirmed. |
| Sponsor-native depth | 15 | Medplum, Deepgram/Gemini, and Stedi contributions are visible through real identifiers, policy decisions, function events, latency, or transaction traces—not narrated as invisible architecture. |
| Product wedge | 10 | The first user, buyer, replaced workflow, measurable outcome, and next pilot are concrete enough to justify a YC follow-up conversation. |
| Demo clarity and reliability | 10 | One causal story lands in four minutes, state can be reset, important text is stage-readable, fixture/live status is unmistakable, and the fallback preserves the same argument. |

## Trust disqualifiers

Any of these outweighs superficial polish:

- fixture, cached, generated, or synthesized content presented as live source data;
- the chart-conditioned question is canned or uses a separate demo engine;
- an agent or browser can finalize clinical data without clinician authority;
- rejected or undecided generated content enters a promoted clinical resource;
- patient-facing diagnosis, individualized treatment advice, guaranteed price, or unsupported prior-authorization claim;
- claimed audio recording, translation, safety coverage, AccessPolicy enforcement, or durable write that cannot be demonstrated;
- cross-patient or cross-session data leakage;
- unsupported-language output presented as safety-screened;
- missing or failed payer values replaced with fabricated reassuring values;
- a failure path fabricates a reassuring answer.

## Demo acceptance

- The core transformation is understandable without an architecture explanation.
- `/prove` can establish non-scripted behavior in 30 seconds or less.
- The main flow completes in four minutes with at least 30 seconds left for the counterfactual proof and close.
- Every external value and persisted resource exposes its origin or identifier.
- A network or credential failure has a rehearsed, visibly labeled fallback.
- The presenter can answer “what is real?”, “who is allowed to act?”, “why this question?”, and “what happens next?” from the UI.

## Verifier questions

1. What single patient or clinician outcome changed because Prologue existed?
2. Can I change one input and observe a different result?
3. Can I see why the result fired and why a negative control did not?
4. Which facts came from the patient, chart, payer, deterministic rule, model, and clinician?
5. What can the agent never do, and is that enforced outside its prompt?
6. Does an escalation create an acknowledged workflow or merely display a warning?
7. Are accepted, edited, rejected, and undecided items represented truthfully?
8. Can every “live” claim be tied to an actual event, trace, policy response, or resource ID?
9. Does the demo still make its argument if voice or network access fails?
10. Who buys this, what workflow changes, and what would the first pilot measure?
