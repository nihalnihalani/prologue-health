import { NextResponse } from "next/server";
import { checkRedFlags, safetyCoverage } from "@/lib/clinical";
import { extractTurn, llmConfigured, PROMPT_VERSION } from "@/lib/llm";
import { resolveTenantId } from "@/lib/durableStore";
import { databaseConfigured } from "@/lib/db/client";
import * as repo from "@/lib/db/sessions";
import { runtimeMode } from "@/lib/runtime";

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
    chartSummary?: string;
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

  /* ---- 2. persist the turn and the rule outcome ---- */
  let turnId: string | null = null;
  let duplicate = false;
  let persistError: string | undefined;

  if (databaseConfigured) {
    try {
      const tenantId = await resolveTenantId();
      const pool = (await import("@/lib/db/client")).getPool();
      const found = await pool.query(
        "SELECT id FROM intake_sessions WHERE tenant_id = $1 AND external_id = $2",
        [tenantId, sessionId]
      );
      if (found.rows[0]) {
        const dbSessionId = found.rows[0].id as string;
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

  /* ---- 3. model extraction, strictly best-effort ---- */
  let extraction: Awaited<ReturnType<typeof extractTurn>> | null = null;
  if (llmConfigured && !duplicate) {
    try {
      extraction = await extractTurn({
        turnText: text,
        chartSummary: body.chartSummary ?? "",
      });
    } catch (err) {
      console.error("[turn] extraction threw:", (err as Error).message);
    }
  }

  /* ---- 4. persist candidates with provenance ---- */
  let factsStored = 0;
  if (extraction && extraction.facts.length && turnId && databaseConfigured) {
    try {
      const tenantId = await resolveTenantId();
      const pool = (await import("@/lib/db/client")).getPool();
      const found = await pool.query(
        "SELECT id FROM intake_sessions WHERE tenant_id = $1 AND external_id = $2",
        [tenantId, sessionId]
      );
      if (found.rows[0]) {
        factsStored = await repo.recordExtractedFacts({
          tenantId,
          sessionId: found.rows[0].id as string,
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

        await repo.recordIntegrationCall({
          tenantId,
          sessionId: found.rows[0].id as string,
          provider: "gemini",
          operation: "extractTurn",
          origin: "live",
          ok: !extraction.abstained,
          latencyMs: extraction.latencyMs,
          traceId: extraction.traceId,
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
