import { NextResponse } from "next/server";
import { requireActor, NotAuthenticatedError, ForbiddenError } from "@/lib/auth";
import { GoogleGenAI } from "@google/genai";

export const dynamic = "force-dynamic";

/**
 * Ephemeral token for the Gemini Live API.
 *
 * Browsers must never hold a raw API key. We mint a short-lived token
 * server-side; the client passes it as `apiKey` to GoogleGenAI with
 * apiVersion v1alpha.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/ephemeral-tokens
 */
export async function GET(req: Request) {
  // Anonymous minting of a paid provider credential is not acceptable.
  try {
    requireActor(req);
  } catch (err) {
    const status = err instanceof NotAuthenticatedError || err instanceof ForbiddenError ? err.status : 401;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "voice_unconfigured" }, { status: 503 });
  }

  try {
    const client = new GoogleGenAI({ apiKey: key });
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
        httpOptions: { apiVersion: "v1alpha" },
      },
    });

    return NextResponse.json({
      token: token.name,
      model: process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview",
    });
  } catch (err) {
    console.error("[gemini] token mint failed:", (err as Error).message);
    return NextResponse.json({ error: "mint_failed" }, { status: 503 });
  }
}
