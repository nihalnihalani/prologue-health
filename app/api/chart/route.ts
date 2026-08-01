import { NextResponse } from "next/server";
import { warmChart, medplumConfigured } from "@/lib/medplum";
import { keyterms } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

/** Warm the patient's chart slice at session start so mid-turn reads are local. */
export async function GET() {
  const r = await warmChart();
  return NextResponse.json({
    chart: r.data,
    ms: r.ms,
    simulated: r.simulated,
    backend: medplumConfigured ? "medplum" : "fixture",
    keyterms: keyterms(),
  });
}
