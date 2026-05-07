/**
 * GET /api/blizzard/roster
 *
 * Fetches the authenticated user's D4 hero roster from the Blizzard API.
 * Returns an array of hero summaries with id, name, class, level, etc.
 *
 * Failure modes (D21/D22/D23):
 * - No tokens (401) → { error, requiresSignIn: true } for client redirect
 * - Rate limit (429) → { error, retryAfter } for inline banner
 * - Other API error → { error } for inline banner
 */

import { NextResponse } from "next/server";
import { BlizzardClient } from "@/lib/blizzard/client";
import { BnetApiError } from "@/lib/blizzard/types";

export async function GET() {
  let client: BlizzardClient;
  try {
    client = await BlizzardClient.fromStoredTokens();
  } catch {
    return NextResponse.json(
      { error: "Not signed in to Battle.net. Visit /settings to connect.", requiresSignIn: true },
      { status: 401 }
    );
  }

  try {
    const profile = await client.fetchProfile();
    return NextResponse.json({ heroes: profile.heroes ?? [] });
  } catch (err) {
    if (err instanceof BnetApiError) {
      if (err.status === 429) {
        return NextResponse.json(
          { error: err.message, rateLimited: true },
          { status: 429 }
        );
      }
      if (err.status === 403) {
        return NextResponse.json(
          {
            error: "Battle.net profile is private or access is restricted. Check your privacy settings.",
            privateProfile: true,
          },
          { status: 403 }
        );
      }
      if (err.status === 401) {
        // Token refresh attempted inside client; if we're here, re-auth is needed
        return NextResponse.json(
          { error: "Session expired. Sign in again to continue.", requiresSignIn: true },
          { status: 401 }
        );
      }
    }
    const message = err instanceof Error ? err.message : "Failed to fetch roster";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
