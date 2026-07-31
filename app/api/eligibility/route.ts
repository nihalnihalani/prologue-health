import { NextResponse } from "next/server";
import { checkEligibility, stediConfigured } from "@/lib/stedi";

export const dynamic = "force-dynamic";

export async function POST() {
  const r = await checkEligibility({
    firstName: "Maria",
    lastName: "Delgado",
    dateOfBirth: "19920314",
    memberId: "W123456789",
  });
  return NextResponse.json({
    benefits: r.data,
    ms: r.ms,
    simulated: r.simulated,
    backend: stediConfigured ? "stedi" : "fixture",
  });
}
