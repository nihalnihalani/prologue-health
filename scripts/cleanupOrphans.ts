/**
 * Deletes the 33 resources orphaned by approval runs made before
 * lib/intake.ts resolved a real Medplum Patient id — they reference the
 * literal, nonexistent Patient/maria-delgado-synthetic and were never
 * reachable from any real patient record. Found by a live, read-only search
 * across Consent/QuestionnaireResponse/Observation/DetectedIssue/Task/
 * Composition on this project. Targets ONLY these 33 specific ids — never a
 * broad sweep, and never re-derived from a fresh search at run time, so this
 * script cannot accidentally catch anything created since.
 *
 * Dry run by default: prints exactly what would be deleted and exits without
 * touching the project. Pass --confirm to actually delete.
 *
 * Run: npm run cleanup:orphans                  (dry run — prints the plan)
 *      npm run cleanup:orphans -- --confirm      (actually deletes)
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MedplumClient } from "@medplum/core";

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
const confirmed = process.argv.includes("--confirm");

interface Target {
  resourceType: string;
  id: string;
}

/** Exact orphaned resources found live on this project, all referencing Patient/maria-delgado-synthetic. */
const TARGETS: Target[] = [
  { resourceType: "Consent", id: "fe1e31b5-52c3-4df3-806d-acc0baf1246f" },

  { resourceType: "QuestionnaireResponse", id: "0a879c10-b6fa-444b-99fe-0c141a9a0ec6" },
  { resourceType: "QuestionnaireResponse", id: "f6a66f2f-7f2f-4073-b4d0-be06dfaf9503" },
  { resourceType: "QuestionnaireResponse", id: "fda4af67-1ccf-4351-a68b-ea89597add8b" },
  { resourceType: "QuestionnaireResponse", id: "c0eafdae-e610-426d-bdf6-63aa98e83ff2" },

  { resourceType: "Observation", id: "fc7f2525-a639-4494-959d-84c357940848" },
  { resourceType: "Observation", id: "8a344f7c-e842-49ec-b910-53ef3b298b79" },
  { resourceType: "Observation", id: "1545164f-3e49-40d7-b465-5b8d044bed40" },
  { resourceType: "Observation", id: "749284b4-8fa4-4e6a-ab0b-b94e8425b979" },
  { resourceType: "Observation", id: "a7b7c431-69d0-428e-bad0-46f26b8db23f" },
  { resourceType: "Observation", id: "dd14cb1f-502b-4188-8bda-068b10c61590" },
  { resourceType: "Observation", id: "46d24366-a194-40c2-b215-8dfddef7d137" },
  { resourceType: "Observation", id: "822d60ee-6037-4661-b353-cfb54c43fa17" },
  { resourceType: "Observation", id: "4ddf4a2c-5ffa-408f-a917-38c0fedeb9e1" },
  { resourceType: "Observation", id: "e1121a0f-0ec7-4480-a86c-f9c1a7a1f487" },
  { resourceType: "Observation", id: "fffdb656-5315-4b15-b492-4b0083cd7108" },
  { resourceType: "Observation", id: "37c6dd4b-7af4-48b5-9ec0-5f0da1040fef" },
  { resourceType: "Observation", id: "b065a845-bf13-4297-890a-735207b18487" },
  { resourceType: "Observation", id: "858bf7d6-711e-40e1-b805-44d0363b7b9c" },
  { resourceType: "Observation", id: "704ba93a-d4fe-418a-a3eb-cf0a269304af" },
  { resourceType: "Observation", id: "7f058b25-b192-42f1-848a-6ba21121920b" },

  { resourceType: "DetectedIssue", id: "3c66b9c3-45bf-4765-b48a-beb2ee9b9d43" },
  { resourceType: "DetectedIssue", id: "9185342d-837d-4fec-be25-59d0051ff4d9" },
  { resourceType: "DetectedIssue", id: "dc97e229-3e55-4f67-ad61-9beb0b90bc77" },
  { resourceType: "DetectedIssue", id: "5550376c-9bea-40a5-a446-234df59bfbe5" },

  { resourceType: "Task", id: "2f5303a0-20d3-4ac9-8966-aaa69ffa9fdf" },
  { resourceType: "Task", id: "a810be1e-4aa2-43b5-8751-fb114be64632" },
  { resourceType: "Task", id: "06b7e5c3-358d-4343-a759-3753aadacb6f" },
  { resourceType: "Task", id: "5434c1b3-a982-4441-a8b1-acebc5a7769f" },

  { resourceType: "Composition", id: "ef188334-18d1-4bc9-9168-fbe019740d39" },
  { resourceType: "Composition", id: "8ccb9a94-e3c6-4b3e-af50-2c327ff77a9e" },
  { resourceType: "Composition", id: "3b6a75fa-b170-4533-a66a-223a6f2acf30" },
  { resourceType: "Composition", id: "7590cca4-025f-4e2e-b291-c03c9ec7518f" },
];

async function main(): Promise<void> {
  console.log(`${confirmed ? "DELETING" : "DRY RUN — would delete"} ${TARGETS.length} resources:\n`);
  for (const t of TARGETS) {
    console.log(`  ${t.resourceType}/${t.id}`);
  }
  console.log("");

  if (!confirmed) {
    console.log("Nothing was deleted. Re-run with --confirm to actually delete these resources.");
    return;
  }

  if (!clientId || !clientSecret) {
    console.error(
      "MEDPLUM_CLIENT_ID / MEDPLUM_CLIENT_SECRET are not set (checked process.env and .env.local). Nothing was deleted."
    );
    process.exitCode = 1;
    return;
  }

  const medplum = new MedplumClient({ baseUrl });
  await medplum.startClientLogin(clientId, clientSecret);

  let ok = 0;
  let failed = 0;
  for (const t of TARGETS) {
    try {
      await medplum.deleteResource(t.resourceType as Parameters<typeof medplum.deleteResource>[0], t.id);
      console.log(`  deleted ${t.resourceType}/${t.id}`);
      ok++;
    } catch (err) {
      console.error(`  FAILED  ${t.resourceType}/${t.id}: ${(err as Error)?.message ?? err}`);
      failed++;
    }
  }

  console.log("");
  console.log(`Deleted ${ok}/${TARGETS.length} resources${failed ? `, ${failed} failed` : ""}.`);
  if (failed) process.exitCode = 1;
}

main();
