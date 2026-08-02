import { NextResponse } from "next/server";
import { checkRedFlags, safetyCoverage } from "@/lib/clinical";
import { resolveTenantId } from "@/lib/durableStore";
import { databaseConfigured } from "@/lib/db/client";
import * as repo from "@/lib/db/sessions";
import { readChart } from "@/lib/medplum";
import { checkEligibility } from "@/lib/stedi";
import { t, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Server-side execution of voice-agent tool calls.
 *
 * Every one of these tools either READS PHI or CLAIMS to mutate clinical
 * workflow, and all of them previously ran in the browser. That put the chart
 * read, the payer call, and the safety verdict inside a surface the patient's
 * own device controls — and it let `save_confirmed_statement` return
 * `{saved: true}` while saving nothing at all, which is worse than not having
 * the tool: the model was told a clinical statement had been recorded when no
 * record existed anywhere.
 *
 * The browser now proxies to here and receives only the minimum needed for the
 * next turn. `say_exactly` in a response is the SERVER's words, and the agent
 * prompt requires it be spoken verbatim — that is what makes deterministic
 * safety outrank the model rather than merely advise it.
 */

const ALLOWED = new Set([
  "check_red_flags",
  "get_relevant_medications",
  "save_confirmed_statement",
  "run_eligibility_check",
]);

export async function POST(req: Request) {
  let body: {
    sessionId?: string;
    name?: string;
    args?: Record<string, unknown>;
    locale?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { sessionId, name } = body;
  const args = body.args ?? {};
  const locale = (body.locale ?? "en") as Locale;

  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  // Allow-list, not a switch default: an unrecognised tool name must not reach
  // any handler, and the model must not be able to invent one.
  if (!name || !ALLOWED.has(name)) {
    return NextResponse.json({ error: "unknown tool" }, { status: 400 });
  }

  // Resolve the session before doing any work. An unknown session gets no chart
  // read, no payer call, and no durable write.
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
      if (!found.rows[0]) {
        return NextResponse.json({ error: "unknown session" }, { status: 404 });
      }
      dbSessionId = found.rows[0].id as string;
      patientRef = found.rows[0].patient_ref as string;
    } catch (err) {
      console.error("[voice-tool] session lookup failed:", (err as Error).message);
      return NextResponse.json({ error: "session unavailable" }, { status: 503 });
    }
  }

  try {
    switch (name) {
      /* ---------------- deterministic safety ---------------- */
      case "check_red_flags": {
        const transcript = String(args.transcript ?? "").slice(0, 4000);
        const flag = checkRedFlags(transcript, locale);
        const coverage = safetyCoverage(locale);

        if (tenantId && dbSessionId) {
          await repo.recordRuleEvaluation({
            tenantId,
            sessionId: dbSessionId,
            ruleId: flag?.ruleId,
            fired: Boolean(flag),
            severity: flag?.severity,
            locale,
            covered: coverage.covered,
            detail: coverage.note ?? flag?.ruleLabel,
          });
        }

        if (!flag) return NextResponse.json({ escalate: false, covered: coverage.covered });

        // The exact words the agent must speak. Deterministic safety outranks
        // the model, so this is not a suggestion for it to paraphrase.
        return NextResponse.json({
          escalate: true,
          rule: flag.ruleId,
          severity: flag.severity,
          say_exactly: t(locale, flag.patientKey ?? "escalateGeneric"),
        });
      }

      /* ---------------- authorized chart read ---------------- */
      case "get_relevant_medications": {
        if (!patientRef) return NextResponse.json({ medications: [] });
        const chart = readChart(patientRef);
        return NextResponse.json({
          // Minimum needed to reason about timing. No identifiers, no dosing
          // instructions the model could turn into advice.
          medications: chart.data.medications.map((m) => ({
            name: m.name,
            started_days_ago: m.startedDaysAgo,
          })),
          origin: chart.simulated ? "fixture" : "live",
        });
      }

      /* ---------------- actually save it ---------------- */
      case "save_confirmed_statement": {
        const text = String(args.text ?? "").trim().slice(0, 2000);
        if (!text) return NextResponse.json({ saved: false, reason: "empty statement" });

        if (!tenantId || !dbSessionId) {
          // Honest refusal. Telling the model something was saved when there is
          // nowhere to save it is exactly the bug this route exists to remove.
          return NextResponse.json({
            saved: false,
            reason: "no durable store configured; the statement was not recorded",
          });
        }

        const turn = await repo.appendTurn({
          tenantId,
          sessionId: dbSessionId,
          speaker: "patient",
          text,
          lang: locale,
          provider: "deepgram",
          providerEventId: `confirmed:${text.slice(0, 80)}`,
        });

        await repo.recordAudit({
          tenantId,
          sessionId: dbSessionId,
          action: "voice.statement_confirmed",
          outcome: "success",
          detail: { category: String(args.category ?? "unspecified"), turnId: turn.id },
        });

        return NextResponse.json({ saved: true, status: "draft", turn_id: turn.id });
      }

      /* ---------------- payer ---------------- */
      case "run_eligibility_check": {
        const r = await checkEligibility({
          firstName: "Maria",
          lastName: "Delgado",
          dateOfBirth: "19920314",
          memberId: "W123456789",
        });
        if (tenantId && dbSessionId) {
          await repo.recordIntegrationCall({
            tenantId,
            sessionId: dbSessionId,
            provider: "stedi",
            operation: "eligibility",
            origin: r.simulated ? "fixture" : "live",
            ok: !r.simulated,
            latencyMs: r.ms,
          });
        }
        return NextResponse.json({
          active: r.data.active,
          copays: r.data.copays,
          deductible_remaining: r.data.deductibleRemaining,
          // Guard rail restated at the boundary the model actually reads.
          note: "Benefits only. Never state a total price or a prior-authorization outcome.",
        });
      }

      default:
        return NextResponse.json({ error: "unknown tool" }, { status: 400 });
    }
  } catch (err) {
    console.error(`[voice-tool] ${name} failed:`, (err as Error).message);
    // Sanitised: the model must not receive a provider stack trace.
    return NextResponse.json({ error: "tool execution failed" }, { status: 500 });
  }
}
