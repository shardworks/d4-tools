/**
 * Blizzard OAuth 2.0 Authorization Code + PKCE helpers (D1, D2, D4, D5).
 *
 * Flow:
 *   1. start() — generate state + PKCE, redirect to Battle.net authorize URL
 *   2. callback() — validate state cookie, exchange code for tokens
 *   3. disconnect() — delete stored tokens
 *
 * The OAuth endpoints (oauth.battle.net) are the same for all regions.
 * Region is stored with the tokens so the API client can use the correct base URL.
 */

import * as crypto from "node:crypto";

// ─── Constants ─────────────────────────────────────────────────────────────

const BNET_AUTHORIZE_URL = "https://oauth.battle.net/authorize";
const BNET_TOKEN_URL = "https://oauth.battle.net/token";
const BNET_SCOPE = "d4.profile";

/** Cookie names used for OAuth CSRF state and PKCE verifier. */
export const STATE_COOKIE = "bnet_oauth_state";
export const VERIFIER_COOKIE = "bnet_pkce_verifier";

// ─── PKCE helpers ──────────────────────────────────────────────────────────

/**
 * Generate a 32-byte hex random state for CSRF validation (D4).
 */
export function generateState(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Generate a PKCE code verifier (64 random bytes, base64url-encoded)
 * and compute the S256 code challenge.
 *
 * The verifier must be stored in a cookie; the challenge is sent in the authorize URL.
 */
export function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(64).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// ─── Authorization URL ─────────────────────────────────────────────────────

export interface AuthorizeUrlParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

/**
 * Build the Battle.net OAuth authorization URL with PKCE (D2).
 */
export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL(BNET_AUTHORIZE_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("scope", BNET_SCOPE);
  url.searchParams.set("state", params.state);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

// ─── Token exchange ────────────────────────────────────────────────────────

export interface TokenExchangeParams {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface RawTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Exchange the authorization code for tokens (D2).
 * Uses HTTP Basic auth for client credentials (standard for Battle.net).
 */
export async function exchangeCodeForTokens(
  params: TokenExchangeParams
): Promise<RawTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });

  const credentials = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString("base64");

  const res = await fetch(BNET_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<RawTokenResponse>;
}

/**
 * Refresh an access token using a refresh token (D22 — single-pass, no anticipatory refresh).
 */
export async function refreshAccessToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<RawTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  });

  const credentials = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString("base64");

  const res = await fetch(BNET_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<RawTokenResponse>;
}

// ─── Env-var helpers ───────────────────────────────────────────────────────

/**
 * Read Battle.net credentials from env. Throws a clear error if missing (D1).
 */
export function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.BLIZZARD_CLIENT_ID;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET must be set to use Battle.net import. " +
        "Register an application at https://develop.battle.net/access/clients and set both env vars."
    );
  }

  return { clientId, clientSecret };
}

/**
 * Build the canonical callback URL from the current request origin.
 */
export function buildCallbackUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.origin}/api/auth/battlenet/callback`;
}
