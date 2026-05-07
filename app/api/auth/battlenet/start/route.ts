/**
 * GET /api/auth/battlenet/start
 *
 * Initiates the Battle.net OAuth Authorization Code + PKCE flow (D1, D2, D4, D5).
 *
 * Reads the desired region from the user's persisted settings (falling back to "americas").
 * Generates a random 32-byte state (CSRF) and a PKCE verifier, stores both in HTTP-only
 * SameSite=Lax cookies, and redirects to the Battle.net authorize URL.
 *
 * Fail-loud on missing env vars (D1): returns HTTP 500 with a clear error message.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  generateState,
  generatePKCE,
  buildAuthorizeUrl,
  buildCallbackUrl,
  getClientCredentials,
  STATE_COOKIE,
  VERIFIER_COOKIE,
} from "@/lib/blizzard/oauth";
import { loadSettings } from "@/lib/persistence/settings";

export async function GET(request: Request) {
  // D1: fail loud if credentials missing
  let clientId: string;
  try {
    ({ clientId } = getClientCredentials());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Missing Battle.net credentials";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Load region from settings (default: americas)
  const settings = await loadSettings().catch(() => ({}));
  const region = (settings as { region?: "americas" | "europe" | "asia" }).region ?? "americas";

  // Generate CSRF state and PKCE
  const state = generateState();
  const { verifier, challenge } = generatePKCE();

  // Store state + verifier in cookies (D4)
  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 minutes — OAuth flow must complete within this window
  };
  cookieStore.set(STATE_COOKIE, `${state}:${region}`, cookieOpts);
  cookieStore.set(VERIFIER_COOKIE, verifier, cookieOpts);

  // Build the authorize URL
  const redirectUri = buildCallbackUrl(request.url);
  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge: challenge,
  });

  return NextResponse.redirect(authorizeUrl);
}
