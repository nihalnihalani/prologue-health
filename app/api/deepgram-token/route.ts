import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Short-lived Deepgram token for the browser.
 *
 * Browsers cannot set custom WebSocket headers, so the Browser Agent SDK passes
 * this via Sec-WebSocket-Protocol. The API key never reaches the client.
 * The SDK calls this before every connection AND reconnection.
 */
export async function GET() {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "voice_unconfigured" }, { status: 503 });
  }
  try {
    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_seconds: 60 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`grant ${res.status}`);
    const json = await res.json();
    return NextResponse.json({ token: json.access_token ?? json.key ?? "" });
  } catch (err) {
    console.error("[deepgram] token grant failed:", (err as Error).message);
    return NextResponse.json({ error: "grant_failed" }, { status: 503 });
  }
}
