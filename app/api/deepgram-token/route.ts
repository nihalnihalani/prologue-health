import { NextResponse } from "next/server";
import { requireActor, NotAuthenticatedError, ForbiddenError } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Short-lived Deepgram token for the browser.
 *
 * Browsers cannot set custom WebSocket headers, so the Browser Agent SDK passes
 * this via Sec-WebSocket-Protocol. The API key never reaches the client.
 * The SDK calls this before every connection AND reconnection.
 */
export async function GET(req: Request) {
  /*
   * Provider access is not free and not anonymous.
   *
   * This endpoint minted a real Deepgram credential for anyone who could reach
   * it — an unauthenticated cost channel, and a way to obtain a clinic's voice
   * capacity without ever entering the product.
   */
  try {
    requireActor(req);
  } catch (err) {
    const status = err instanceof NotAuthenticatedError || err instanceof ForbiddenError ? err.status : 401;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }

  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "voice_unconfigured" }, { status: 503 });
  }
  try {
    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_seconds: 60, ttl: 60 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`grant ${res.status}`);
    const json = await res.json();
    return NextResponse.json({
      token: json.access_token ?? json.key ?? "",
      expiresIn: json.expires_in ?? 60,
    });
  } catch (err) {
    console.error("[deepgram] token grant failed:", (err as Error).message);
    return NextResponse.json({ error: "grant_failed" }, { status: 503 });
  }
}
