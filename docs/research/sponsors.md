# Sponsor API Research — Verified Findings

*All claims verified against primary documentation. Constraints marked ⚠️ are the ones that change designs.*

---

## Access — all self-serve, no card, no sales call

| Sponsor | Signup | Notes |
|---|---|---|
| **Deepgram** | `console.deepgram.com/signup` | $200 credit auto-granted, no card. **Voice Agent API is GA since June 2025** — not a waitlist product |
| **Stedi** | `stedi.com/create-sandbox` | ~2 minutes, no contract. Sandbox accounts are test-mode only |
| **Medplum** | `app.medplum.com/register` | Self-serve Project creation, no approval step |
| **Moss** | `npm i @inferedge/moss` | On-device Rust/WASM semantic search. **Not** on the official hackathon resources list — optional, not expected |
| **Pavoot** | — | ⚠️ **No public developer API exists.** Not integrable. Do not attempt |

⚠️ **Moss name collision:** searching "Moss API" surfaces `getmoss.com`, an unrelated expense-management company with its own OAuth API. The correct one is `moss.dev` / `@inferedge/moss` / InferEdge (YC F25).

**Officially listed hacker resources:** Medplum, Stedi, Deepgram. Using all three well is the baseline for a serious entry.

---

## Medplum

### Stedi integration — [docs](https://www.medplum.com/docs/integration/stedi) · **dated July 27, 2026**

| X12 | FHIR mapping |
|---|---|
| **270/271** eligibility | `CoverageEligibilityRequest` → `CoverageEligibilityResponse` |
| **837P** professional claims | `Claim` via **`$stedi-submit-claim`** operation (Stedi correlation ID written back to the Claim) |
| **277CA** acknowledgments, **835** ERA | `DocumentReference`, stored verbatim |

**Why this matters:** we don't hand-roll the X12↔FHIR mapping. Our FHIR is correct by construction, on a documented path published four days before the event.

⚠️ The page contains no code examples, config steps, or auth requirements — **plan a direct-Stedi fallback** in case the four-day-old path has rough edges.

### AI architecture — [docs](https://www.medplum.com/docs/ai)

Medplum prescribes the **"can suggest, but not act"** pattern: *"an AI may draft a note or recommend an order, while a human remains responsible."* Enforced with:
- **AuditEvent logging** — every AI action captured in FHIR-standard audit logs
- **Role-based permissions** — AI agents governed by *"the same policy framework as a human user"*

Also documented: a **`$ai` operation** and **Medplum MCP**.

**Consequence:** our review gate is the platform's documented architecture, not our invention.

### Other

- **Bots** — TypeScript serverless functions, triggered by FHIR **Subscriptions** (rest-hook, websocket, or bot channel). Fast to set up.
- **Auth** — OAuth2 client credentials against `/oauth2/token`, Basic auth header with `client_id:client_secret`. Hosted API base `https://api.medplum.com`.
- `@medplum/core` is an isomorphic TS SDK (fetch-based); `@medplum/react` is a separate component library.
- **Electronic Prior Auth** — a live *alpha* integration for CMS-0057-F with CDS Hooks discovery at `https://api.staging.medplum.dev/cds-services`. Staging is available 24/7, no SLA, test data may reset.
- ⚠️ **Medplum does not document Da Vinci PAS profile support.** Claim CDS Hooks + standard `Claim`/`ClaimResponse`/`CoverageEligibilityRequest` — not "ships PAS profiles."
- **Rate limits** are per-IP over a 1-minute window, plus a secondary FHIR-interaction load limit weighted by operation complexity. Check the `RateLimit` response header during build rather than assuming a number.
- **Medplum Agent** is a *separate* on-prem Node service bridging HL7v2/MLLP, ASTM, and DICOM over encrypted WebSockets. Architectural inspiration, **not** an embeddable dependency.

---

## Deepgram

### Voice Agent Settings — [configure](https://developers.deepgram.com/docs/configure-voice-agent) · [function calling](https://developers.deepgram.com/docs/voice-agents-function-calling)

Verified field paths:

```
audio.input.encoding                 "linear16" (default)
audio.input.sample_rate              16000 (default)
audio.output.{encoding,sample_rate,bitrate,container}

agent.listen.provider.type           "deepgram"
agent.listen.provider.model          nova-3 family (v1) | flux-general-en, flux-general-multi (v2)
agent.listen.provider.version        "v1" | "v2"
agent.listen.provider.language
agent.listen.provider.keyterms       ← keyterm prompting, FIRST-CLASS field
agent.listen.provider.eot_threshold  ← end-of-turn tuning

agent.think.provider.type            "open_ai" | "anthropic" | "google" | "groq" | "aws_bedrock"
agent.think.provider.model
agent.think.provider.temperature     0–2 (OpenAI/Google/Groq), 0–1 (Anthropic)
agent.think.provider.reasoning_mode  "low" | "medium" | "high"
agent.think.prompt                   max 25,000 chars for managed LLMs
agent.think.functions                ← array of callable functions

agent.speak.provider.type            "deepgram" | "eleven_labs" | "cartesia" | "open_ai" | "aws_polly"
agent.speak.provider.version         "v1" (Aura) | "v2" (Flux)
agent.speak.provider.model           e.g. "aura-2-thalia-en", "flux-alexis-en"
agent.speak.provider.{speed,language}

agent.greeting
agent.context.messages
flags.history
```

### Function calling

- **Client-side** — our app executes. Best for UI actions, local device data, client-authenticated APIs.
- **Server-side** — Deepgram calls an endpoint we provide. Best for secure operations, DB lookups, third-party services.
- Message types: **`FunctionCallRequest`** (server→client) / **`FunctionCallResponse`** (client→server).
- Flow: detect intent → select function → extract parameters → send request → process response → speak the answer.

⚠️ The intro pages do not document exact `FunctionCallRequest`/`FunctionCallResponse` JSON fields, latency behavior, or blocking semantics. **Verify against `/reference/voice-agent/voice-agent` before writing the handler.** Deepgram also publishes an `llms.txt` index and an MCP server.

### Models — decision

**`nova-3` + `keyterms`, not Flux.** Flux is tuned for turn-taking latency, but this product lives or dies on transcribing **"lamotrigine"** and **"divalproex"** correctly. Drug-name accuracy beats tens of milliseconds. `eot_threshold` is the lever for turn-taking feel instead.

Other verified capabilities: Nova-3 Medical variant, Aura-2 TTS (~90ms, vendor-stated), speaker diarization, keyterm prompting up to 100 terms.

⚠️ **Concurrency:** limits are per-project, and self-serve projects may be limited to a single concurrent stream. Sources disagree on the exact number — **confirm your project's limit in the console and ensure only one demo instance is connected** to avoid a 429 mid-pitch.

---

## Stedi

### Test mode — [docs](https://www.stedi.com/docs/healthcare/test-mode)

| ✅ Supported | ❌ **Not supported** |
|---|---|
| **270/271** real-time eligibility | **278 prior authorization** |
| **837** claims (`usageIndicator: "T"` / `ISA15: "T"`) | **276/277** real-time claim status |
| **835** ERA from Stedi Test Payer | 275 attachments |
| **277CA** acknowledgments | Transaction enrollment, insurance discovery, COB |

### ⚠️ The three constraints that shape the build

1. **278 prior auth is unavailable in test mode.** Any demo claiming a live 278 is either not in test mode or not telling the truth.
2. **Mock payers are limited to Aetna, Cigna, UnitedHealthcare, and CMS.** *"Custom mock data or payer selection"* is **not supported** — so **the synthetic patient must be built around Stedi's fixture, not the reverse.** Resolve this on day one.
3. **Payer "Stedi Agent" returns a deliberate AAA error 73** (Invalid/Missing Subscriber/Insured Name). A documented, reproducible failure — useful for demoing graceful degradation on purpose.

### Other

- Test transactions are **free**.
- The 271 returns **copays, deductibles, other patient payment responsibilities, and active coverage**.
- Claims-processing endpoints share a pooled limit of ~100 req/s and 100 concurrent in-flight requests. Not a binding constraint for a demo.
- ⚠️ Test mode docs provide **no example request/response bodies**. Budget time to discover the shapes empirically.

---

## Not used

- **Pavoot** — AI event manager (YC P26). No public developer API, no healthcare relevance. Ana Yoon judges as a technical founder, not because her product is usable here.
- **Moss** — genuine capability (sub-10ms on-device retrieval, exactly matching our latency thesis) but **not on the official resources list**. Differentiation if used, not table stakes. Don't put an unlisted dependency on the critical path.
