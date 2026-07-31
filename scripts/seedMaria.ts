/**
 * Seeds the synthetic Maria Delgado patient into a real Medplum project.
 *
 * Without this, every FHIR resource the app writes (Consent, Observation,
 * Provenance, ...) references Patient/maria-delgado-synthetic, which never
 * existed server-side — orphaned references. This creates that Patient and
 * the chart data around it, sourced entirely from lib/fixtures.ts.
 *
 * Medplum only assigns server-generated UUIDs; "update as create" with a
 * client-chosen id like "maria-delgado-synthetic" is rejected outright
 * (confirmed against the live API, and documented as unsupported in
 * https://github.com/medplum/medplum/discussions/1175). So instead of
 * updateResource-by-id, each fixture carries a stable
 * FIXTURE_IDENTIFIER_SYSTEM identifier (lib/fixtures.ts), and this script
 * uses medplum.upsertResource(resource, "identifier=...") — a single
 * transactional search-or-create — to find and update the same resource on
 * every rerun instead of duplicating it. The Patient is resolved/created
 * first, and its real id is substituted into every other resource's
 * subject/patient/beneficiary reference before they're written.
 *
 * Run: npm run seed
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MedplumClient } from "@medplum/core";
import {
  PATIENT_ID,
  FIXTURE_IDENTIFIER_SYSTEM,
  patient,
  medicationRequests,
  conditions,
  allergies,
  coverage,
} from "../lib/fixtures";

/** tsx does not load .env.local the way Next.js does; fill in what's missing. */
function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const baseUrl = process.env.MEDPLUM_BASE_URL || "https://api.medplum.com/";
const clientId = process.env.MEDPLUM_CLIENT_ID;
const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "MEDPLUM_CLIENT_ID / MEDPLUM_CLIENT_SECRET are not set (checked process.env and .env.local). Nothing was seeded."
  );
  process.exit(1);
}

const appUrl = baseUrl.includes("api.medplum.com") ? "https://app.medplum.com" : baseUrl.replace(/\/$/, "");

interface SeedResult {
  resourceType: string;
  identifierValue: string;
  id?: string;
  ok: boolean;
  error?: string;
}

/** Drop the fixture's literal id — Medplum will never accept it; the identifier is what makes this idempotent. */
function withoutId(resource: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, ...rest } = resource;
  return rest;
}

/** Point this resource's patient reference at Medplum's real, server-assigned Patient id. */
function withPatientRef(resource: Record<string, unknown>, realPatientId: string): Record<string, unknown> {
  const ref = { reference: `Patient/${realPatientId}` };
  if (resource.resourceType === "AllergyIntolerance") return { ...resource, patient: ref };
  if (resource.resourceType === "Coverage") return { ...resource, beneficiary: ref };
  return { ...resource, subject: ref };
}

async function upsertByIdentifier(
  medplum: MedplumClient,
  resource: Record<string, unknown>,
  identifierValue: string
): Promise<SeedResult> {
  const resourceType = String(resource.resourceType);
  try {
    const result = await medplum.upsertResource(
      resource as Parameters<typeof medplum.upsertResource>[0],
      `identifier=${FIXTURE_IDENTIFIER_SYSTEM}|${identifierValue}`
    );
    return { resourceType, identifierValue, id: result.id, ok: true };
  } catch (err) {
    return { resourceType, identifierValue, ok: false, error: (err as Error)?.message ?? String(err) };
  }
}

async function main(): Promise<void> {
  const medplum = new MedplumClient({ baseUrl });
  await medplum.startClientLogin(clientId as string, clientSecret as string);

  const results: SeedResult[] = [];

  // Patient first — every other resource needs its real, server-assigned id.
  const patientResult = await upsertByIdentifier(
    medplum,
    withoutId(patient as unknown as Record<string, unknown>),
    PATIENT_ID
  );
  results.push(patientResult);

  const report = () => {
    for (const r of results) {
      const label = r.id ? `${r.resourceType}/${r.id}` : `${r.resourceType} (${r.identifierValue})`;
      console.log(`  ${r.ok ? "ok  " : "FAIL"} ${label}${r.error ? ` — ${r.error}` : ""}`);
    }
    const failed = results.filter((r) => !r.ok);
    console.log("");
    console.log(`Seeded ${results.length - failed.length}/${results.length} resources.`);
    if (patientResult.ok && patientResult.id) {
      console.log(`Medplum: ${appUrl}/Patient/${patientResult.id}`);
    }
    if (failed.length) process.exitCode = 1;
  };

  if (!patientResult.ok || !patientResult.id) {
    console.error("Patient could not be created; nothing else can be linked to it.");
    report();
    return;
  }

  const realPatientId = patientResult.id;
  const rest: { resource: Record<string, unknown>; identifierValue: string }[] = [
    { resource: coverage as unknown as Record<string, unknown>, identifierValue: coverage.id },
    ...medicationRequests.map((m) => ({ resource: m as unknown as Record<string, unknown>, identifierValue: m.id })),
    ...conditions.map((c) => ({ resource: c as unknown as Record<string, unknown>, identifierValue: c.id })),
    ...allergies.map((a) => ({ resource: a as unknown as Record<string, unknown>, identifierValue: a.id })),
  ];

  for (const { resource, identifierValue } of rest) {
    const prepared = withPatientRef(withoutId(resource), realPatientId);
    results.push(await upsertByIdentifier(medplum, prepared, identifierValue));
  }

  report();
}

main().catch((err) => {
  console.error("[seed] failed before any writes:", (err as Error)?.message ?? err);
  process.exitCode = 1;
});
