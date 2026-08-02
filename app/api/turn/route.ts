import { NextResponse } from "next/server";
import { checkRedFlags, safetyCoverage } from "@/lib/clinical";
import { extractTurn, llmConfigured, PROMPT_VERSION } from "@/lib/llm";
import { resolveTenantId } from "@/lib/durableStore";
import { databaseConfigured } from "@/lib/db/client";
import * as repo from "@/lib/db/sessions";
import { runtimeMode } from "@/lib/runtime";
import { requireActor, assertMayAccessPatient, NotAuthenticatedError, ForbiddenError } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The server-owned turn.
 *
 * ORDER MATTERS HERE, and it is not an implementation detail:
 *
 *   1. persist the patient's words immutably
 *   2. run the DETERMINISTIC safety rules
 *   3. only then ask the model for candidate facts
 *
 * Safety is evaluated from the transcript alone and never reads the model's
 * output, so an LLM that is slow, wrong, refusing, or entirely absent cannot
 * suppress an escalation. The extraction step is wrapped so that its failure
 * degrades to "no candidates" rather than failing the turn — losing a
 * convenience must never cost a red flag.
 *
 * What comes back is a DRAFT: candidate facts bound to the exact words that
 * produced them. Nothing here is promotable without an explicit clinician
 * decision, and nothing here creates a clinical resource.
 */
export async function POST(req: Request) {
  const started = Date.now();

  let body: {
    sessionId?: string;
    text?: string;
    locale?: string;
    atSeconds?: number;
    provider?: string;
    providerEventId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  const sessionId = body.sessionId;
  const locale = body.locale ?? "en";

  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
  // Bound the payload: an unbounded transcript is both a cost and an injection
  // surface, and no genuine intake turn is this long.
  if (text.length > 4000) {
    return NextResponse.json({ error: "text exceeds 4000 characters" }, { status: 413 });
  }

  /* ---- 1. deterministic safety, first and unconditionally ---- */
  const t0 = Date.now();
  const flag = checkRedFlags(text, locale);
  const coverage = safetyCoverage(locale);
  const safetyMs = Date.now() - t0;

  /* ---- 2. resolve the session, then persist the turn and rule outcome ---- */
  let turnId: string | null = null;
  let duplicate = false;
  let persistError: string | undefined;
  let tenantId: string | null = null;
  let dbSessionId: string | null = null;
  let patientRef: string | null = null;

  if (databaseConfigured) {
    try {
      tenantId = await resolveTenantId();
      const pool = (await import("@/lib/db/client")).getPool();
      const found = await pool.query(
        "SELECT id, patient_ref FROM intake_sessions WHERE tenant_id = $1 AND external_id = $2",
        [tenantId, sessionId]
      );
      if (found.rows[0]) {
        dbSessionId = found.rows[0].id as string;
        patientRef = found.rows[0].patient_ref as string;

        /*
         * A patient token may drive exactly ONE patient's intake.
         *
         * Checked against the SESSION's patient reference rather than anything
         * the request asserts — otherwise the caller would be marking their own
         * homework and could submit turns into someone else's chart.
         */
        try {
          const actor = requireActor(req);
          assertMayAccessPatient(actor, patientRef);
        } catch (err) {
          const status =
            err instanceof NotAuthenticatedError || err instanceof ForbiddenError ? err.status : 401;
          return NextResponse.json({ error: (err as Error).message }, { status });
        }
        const appended = await repo.appendTurn({
          tenantId,
          sessionId: dbSessionId,
          speaker: "patient",
          text,
          lang: locale,
          atSeconds: body.atSeconds,
          provider: body.provider,
          providerEventId: body.providerEventId,
        });
        turnId = appended.id;
        duplicate = appended.duplicate;

        // The negative case is recorded too: "rules ran and found nothing" and
        // "rules could not run for this language" must stay distinguishable.
        await repo.recordRuleEvaluation({
          tenantId,
          sessionId: dbSessionId,
          turnId,
          ruleId: flag?.ruleId,
          fired: Boolean(flag),
          severity: flag?.severity,
          locale,
          covered: coverage.covered,
          detail: coverage.note ?? flag?.ruleLabel,
          durationMs: safetyMs,
        });
      }
    } catch (err) {
      persistError = (err as Error).message;
      console.error("[turn] persist failed:", persistError);
      if (runtimeMode() === "pilot") {
        return NextResponse.json({ error: "turn could not be persisted" }, { status: 503 });
      }
    }
  }

  /*
   * An UNKNOWN session gets no model call.
   *
   * Previously any caller could POST an arbitrary sessionId and have us run a
   * paid LLM request for it — an unauthenticated cost-and-abuse channel, and a
   * way to get model output for a session that was never consented to. Safety
   * has already been evaluated and is still returned; what is refused is the
   * spend and the generated content.
   */
  const sessionKnown = !databaseConfigured || Boolean(dbSessionId);
  if (databaseConfigured && !dbSessionId && !persistError) {
    return NextResponse.json(
      {
        error: "unknown session",
        // The deterministic result still stands; it cost nothing and hiding it
        // would be strictly worse for the caller.
        safety: {
          escalate: Boolean(flag),
          ruleId: flag?.ruleId ?? null,
          severity: flag?.severity ?? null,
          covered: coverage.covered,
          note: coverage.note ?? null,
          ms: safetyMs,
        },
      },
      { status: 404 }
    );
  }

  /* ---- 3. chart context, derived SERVER-SIDE ---- */
  /*
   * The browser used to supply `chartSummary`, which meant an attacker could
   * put arbitrary text into the model's context for a real session — a direct
   * prompt-injection surface — and could assert chart facts the chart does not
   * contain. Chart context is authorized data and must come from the chart.
   */
  let chartSummary = "";
  if (patientRef) {
    try {
      const { readChart } = await import("@/lib/medplum");
      const chart = readChart(patientRef).data;
      chartSummary = chart.medications
        .map((m) => `${m.name}${m.startedDaysAgo ? ` (started ${m.startedDaysAgo} days ago)` : ""}`)
        .join("; ");
    } catch {
      // No warmed chart is a legitimate state, not a reason to trust the client.
      chartSummary = "";
    }
  }

  /* ---- 4. model extraction, strictly best-effort ---- */
  let extraction: Awaited<ReturnType<typeof extractTurn>> | null = null;
  let extractionError: string | undefined;
  if (llmConfigured && !duplicate && sessionKnown) {
    try {
      extraction = await extractTurn({ turnText: text, chartSummary });
    } catch (err) {
      extractionError = (err as Error).message;
      console.error("[turn] extraction threw:", extractionError);
    }
  }

  /* ---- 5. persist candidates AND the call itself ---- */
  let factsStored = 0;
  if (tenantId && dbSessionId) {
    try {
      if (extraction && extraction.facts.length && turnId) {
        factsStored = await repo.recordExtractedFacts({
          tenantId,
          sessionId: dbSessionId,
          turnId,
          provider: extraction.provider,
          modelVersion: extraction.modelVersion,
          promptVersion: extraction.promptVersion,
          traceId: extraction.traceId,
          facts: extraction.facts.map((f) => ({
            field: f.field,
            value: f.value,
            spanStart: f.spanStart,
            spanEnd: f.spanEnd,
            confidence: f.confidence,
            uncertain: f.uncertain,
          })),
        });
      }

      /*
       * Record the call whenever one was ATTEMPTED, not only when it produced
       * facts. Logging only successes made abstentions, provider failures, and
       * empty results invisible — so the durable history would have shown a
       * model that never failed and never declined, which is the opposite of
       * what an operator needs to see.
       */
      if (llmConfigured && !duplicate) {
        await repo.recordIntegrationCall({
          tenantId,
          sessionId: dbSessionId,
          provider: "gemini",
          operation: "extractTurn",
          origin: extraction ? "live" : "failed",
          ok: Boolean(extraction && !extraction.abstained),
          latencyMs: extraction?.latencyMs,
          traceId: extraction?.traceId,
          errorClass: extractionError
            ? "provider_error"
            : extraction?.abstained
              ? "abstained"
              : undefined,
          errorMessage: extractionError ?? extraction?.abstainReason,
        });
      }
    } catch (err) {
      console.error("[turn] fact persist failed:", (err as Error).message);
    }
  }

  return NextResponse.json({
    turnId,
    duplicate,
    persisted: Boolean(turnId),
    persistError,

    // Deterministic and authoritative.
    safety: {
      escalate: Boolean(flag),
      ruleId: flag?.ruleId ?? null,
      severity: flag?.severity ?? null,
      clinicMessage: flag?.clinicMessage ?? null,
      // Coverage is a fact about the packet: "not screened" is not "nothing found".
      covered: coverage.covered,
      note: coverage.note ?? null,
      ms: safetyMs,
    },

    // Model-assisted DRAFT. Candidates only — never clinical truth, never
    // promotable without an explicit clinician decision.
    extraction: extraction
      ? {
          available: true,
          provider: extraction.provider,
          model: extraction.modelVersion,
          promptVersion: extraction.promptVersion,
          latencyMs: extraction.latencyMs,
          abstained: extraction.abstained,
          abstainReason: extraction.abstainReason ?? null,
          ungroundedRejected: extraction.rejected,
          stored: factsStored,
          facts: extraction.facts,
        }
      : {
          available: false,
          reason: llmConfigured
            ? duplicate
              ? "duplicate turn — extraction skipped"
              : "extraction failed"
            : "GEMINI_API_KEY is not configured",
          promptVersion: PROMPT_VERSION,
        },

    totalMs: Date.now() - started,
  });
}
