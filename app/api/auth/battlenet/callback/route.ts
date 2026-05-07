/**
 * GET /api/auth/battlenet/callback
 *
 * Handles the Battle.net OAuth callback (D4, D5).
 *
 * Validates the state cookie (CSRF mismatch → full-page error per D21).
 * Exchanges the authorization code for tokens using PKCE verifier.
 * Persists tokens via lib/blizzard/tokens.ts.
 * On success, redirects to /import.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeCodeForTokens,
  buildCallbackUrl,
  getClientCredentials,
  STATE_COOKIE,
  VERIFIER_COOKIE,
} from "@/lib/blizzard/oauth";
import { saveTokens } from "@/lib/blizzard/tokens";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // Handle user denial or OAuth error
  if (errorParam) {
    const desc = url.searchParams.get("error_description") ?? errorParam;
    return NextResponse.redirect(
      new URL(`/import/error?reason=${encodeURIComponent(desc)}`, request.url)
    );
  }

  if (!code || !returnedState) {
    return NextResponse.redirect(
      new URL("/import/error?reason=missing_code_or_state", request.url)
    );
  }

  // Validate CSRF state cookie (D4, D21)
  const cookieStore = await cookies();
  const storedStateCookie = cookieStore.get(STATE_COOKIE)?.value;
  const verifier = cookieStore.get(VERIFIER_COOKIE)?.value;

  if (!storedStateCookie || !verifier) {
    // State/verifier cookies missing — likely an expired session or CSRF attack
    return NextResponse.redirect(
      new URL("/import/error?reason=csrf_state_missing", request.url)
    );
  }

  // The cookie stores "state:region"
  const colonIdx = storedStateCookie.indexOf(":");
  const storedState = colonIdx >= 0 ? storedStateCookie.slice(0, colonIdx) : storedStateCookie;
  const region = (
    colonIdx >= 0 ? storedStateCookie.slice(colonIdx + 1) : "americas"
  ) as "americas" | "europe" | "asia";

  if (returnedState !== storedState) {
    // CSRF mismatch — full-page error per D21
    return NextResponse.redirect(
      new URL("/import/error?reason=csrf_mismatch", request.url)
    );
  }

  // Clear the OAuth cookies
  cookieStore.delete(STATE_COOKIE);
  cookieStore.delete(VERIFIER_COOKIE);

  // Exchange code for tokens
  let clientId: string;
  let clientSecret: string;
  try {
    ({ clientId, clientSecret } = getClientCredentials());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Missing Battle.net credentials";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    const redirectUri = buildCallbackUrl(request.url);
    const rawTokens = await exchangeCodeForTokens({
      clientId,
      clientSecret,
      code,
      redirectUri,
      codeVerifier: verifier,
    });

    await saveTokens(rawTokens, region);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token exchange failed";
    return NextResponse.redirect(
      new URL(`/import/error?reason=${encodeURIComponent(message)}`, request.url)
    );
  }

  // Success — redirect to the import roster
  return NextResponse.redirect(new URL("/import", request.url));
}
