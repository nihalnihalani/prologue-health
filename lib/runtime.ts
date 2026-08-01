/**
 * Runtime mode.
 *
 * The prototype falls back to labeled fixtures whenever an integration is
 * missing. That is correct for a demo and unacceptable for a clinic: a fixture
 * presented as live clinical or payer data is a patient-safety event, not a UX
 * problem.
 *
 *   demo   — fixtures permitted, always labeled `simulated: true`
 *   pilot  — real integrations required. A missing or failing integration
 *            SURFACES as an error. Synthetic clinical or payer data is never
 *            substituted.
 *
 * Set PROLOGUE_MODE=pilot to enable the strict path.
 */

export type RuntimeMode = "demo" | "pilot";

export function runtimeMode(): RuntimeMode {
  return process.env.PROLOGUE_MODE === "pilot" ? "pilot" : "demo";
}

export const isPilot = () => runtimeMode() === "pilot";

/** Thrown when pilot mode would otherwise have served synthetic data. */
export class IntegrationUnavailableError extends Error {
  readonly integration: string;
  readonly cause?: string;
  constructor(integration: string, cause?: string) {
    super(
      `[pilot] ${integration} is unavailable and synthetic substitution is not permitted` +
        (cause ? `: ${cause}` : "")
    );
    this.name = "IntegrationUnavailableError";
    this.integration = integration;
    this.cause = cause;
  }
}

/**
 * Guard every fixture fallback. In demo mode this is a no-op; in pilot mode it
 * refuses rather than silently substituting.
 */
export function assertFixtureAllowed(integration: string, cause?: string): void {
  if (isPilot()) throw new IntegrationUnavailableError(integration, cause);
}

/** Provenance of a value, carried through to the UI so it is never ambiguous. */
export type DataOrigin = "live" | "fixture" | "cache" | "failed";

export interface Sourced<T> {
  data: T;
  origin: DataOrigin;
  ms: number;
  /** Present when origin is "failed" or a degraded fallback was used. */
  detail?: string;
}
