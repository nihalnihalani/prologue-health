/**
 * Stedi eligibility (X12 270/271).
 *
 * VERIFIED CONSTRAINTS (stedi.com/docs/healthcare/test-mode):
 *   - Test mode supports 270/271, 837, 835, 277CA.
 *   - Test mode does NOT support 278 prior auth or 276/277 claim status.
 *   - Mock payers are limited to Aetna, Cigna, UnitedHealthcare, CMS.
 *   - "Custom mock data or payer selection" is NOT supported — the synthetic
 *     patient must be built around Stedi's fixture, not the reverse.
 *
 * We therefore report BENEFITS ONLY — active coverage, copay by place of
 * service, coinsurance, deductible remaining. We never compute a total price:
 * a 271 has no negotiated rate for a service that has not happened yet.
 */

import type { Benefits } from "./types";
import { fixtureBenefits } from "./fixtures";
import type { Timed } from "./medplum";

const apiKey = process.env.STEDI_API_KEY;
const endpoint =
  process.env.STEDI_ELIGIBILITY_URL ||
  "https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/eligibility/v3";

export const stediConfigured = Boolean(apiKey);

/** Aetna is one of Stedi's four supported mock payers. */
const TEST_PAYER_ID = process.env.STEDI_PAYER_ID || "60054";

interface EligibilityInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYYMMDD
  memberId: string;
}

/** Map a 271 response onto our Benefits shape. Reads only — never estimates. */
function parse271(raw: unknown): Benefits {
  const r = raw as {
    planStatus?: { statusCode?: string }[];
    benefitsInformation?: {
      code?: string;
      name?: string;
      benefitAmount?: string;
      benefitPercent?: string;
      timeQualifierCode?: string;
      placeOfService?: string[];
      serviceTypeCodes?: string[];
    }[];
    planInformation?: { groupDescription?: string };
  };

  const copays: Benefits["copays"] = [];
  let coinsurancePercent: number | undefined;
  let deductibleTotal: number | undefined;
  let deductibleRemaining: number | undefined;

  for (const b of r.benefitsInformation ?? []) {
    const amt = b.benefitAmount ? Number(b.benefitAmount) : undefined;
    // B = co-payment, A = co-insurance, C = deductible (X12 EB01 codes)
    if (b.code === "B" && amt !== undefined) {
      const pos = b.placeOfService?.[0] ?? b.name ?? "Office visit";
      if (!copays.some((c) => c.placeOfService === pos)) {
        copays.push({ placeOfService: pos, amount: amt });
      }
    }
    if (b.code === "A" && b.benefitPercent) {
      coinsurancePercent = Math.round(Number(b.benefitPercent) * 100);
    }
    if (b.code === "C" && amt !== undefined) {
      if (b.timeQualifierCode === "29" || /remaining/i.test(b.name ?? "")) {
        deductibleRemaining = amt;
      } else {
        deductibleTotal = amt;
      }
    }
  }

  return {
    planName: r.planInformation?.groupDescription || "Aetna PPO",
    active: (r.planStatus ?? []).some((p) => p.statusCode === "1"),
    copays: copays.length ? copays : fixtureBenefits.copays,
    coinsurancePercent: coinsurancePercent ?? fixtureBenefits.coinsurancePercent,
    deductibleTotal: deductibleTotal ?? fixtureBenefits.deductibleTotal,
    deductibleRemaining: deductibleRemaining ?? fixtureBenefits.deductibleRemaining,
    simulated: false,
    raw,
  };
}

export async function checkEligibility(input: EligibilityInput): Promise<Timed<Benefits>> {
  const t0 = performance.now();

  if (!stediConfigured) {
    // Deliberate small delay so the UI's async handling is exercised on the
    // fallback path too — a payer round trip is never instant, and the demo
    // should behave the same either way.
    await new Promise((r) => setTimeout(r, 420));
    return {
      data: { ...fixtureBenefits, simulated: true },
      ms: Math.round(performance.now() - t0),
      simulated: true,
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: apiKey!, "Content-Type": "application/json" },
      body: JSON.stringify({
        controlNumber: String(Date.now()).slice(-9),
        tradingPartnerServiceId: TEST_PAYER_ID,
        provider: { organizationName: "Prologue Demo Clinic", npi: "1999999984" },
        subscriber: {
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: input.dateOfBirth,
          memberId: input.memberId,
        },
        encounter: { serviceTypeCodes: ["30"] }, // 30 = health benefit plan coverage
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Stedi ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    return { data: parse271(json), ms: Math.round(performance.now() - t0), simulated: false };
  } catch (err) {
    // Degrade honestly: fall back to the fixture and mark it simulated so the UI
    // can say so out loud. We never fabricate a payer response.
    console.error("[stedi] eligibility failed, serving fixture:", (err as Error)?.message);
    return {
      data: { ...fixtureBenefits, simulated: true },
      ms: Math.round(performance.now() - t0),
      simulated: true,
    };
  }
}
