/**
 * Blizzard D4 Game Data API client (D6, D7, D8, D22, D23).
 *
 * - Uses native fetch (D6); no third-party HTTP client.
 * - Server-proxy pattern (D7): tokens stay server-side.
 * - Region-aware (D8): reads region from stored tokens.
 * - Single-pass transparent refresh on 401 (D22).
 * - Surfaces 429 with Retry-After (D23) — caller handles the banner.
 */

import type { BnetProfile, BnetHero, BnetHeroItems, BnetApiError as BnetApiErrorType } from "./types";
import { BnetApiError } from "./types";
import { loadTokens, saveTokens } from "./tokens";
import { refreshAccessToken, getClientCredentials } from "./oauth";

// ─── Region → API base URL mapping ────────────────────────────────────────

const REGION_BASE_URLS: Record<"americas" | "europe" | "asia", string> = {
  americas: "https://us.api.blizzard.com",
  europe: "https://eu.api.blizzard.com",
  asia: "https://kr.api.blizzard.com",
};

// ─── Internal fetch helper ─────────────────────────────────────────────────

/**
 * Fetch from the Blizzard API with bearer auth.
 * Returns the parsed JSON or throws BnetApiError on non-OK responses.
 */
async function bnetFetch<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (res.ok) {
    return res.json() as Promise<T>;
  }

  // Surface rate-limit details for the caller (D23)
  if (res.status === 429) {
    const retryAfterHeader = res.headers.get("Retry-After");
    const retryAfterSeconds = retryAfterHeader != null ? parseInt(retryAfterHeader, 10) : undefined;
    throw new BnetApiError(
      429,
      await res.text(),
      `Battle.net rate limit exceeded. Retry after ${retryAfterHeader ?? "unknown"} seconds.`,
      Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined
    );
  }

  throw new BnetApiError(res.status, await res.text());
}

// ─── Public API client ─────────────────────────────────────────────────────

export class BlizzardClient {
  private constructor(
    private accessToken: string,
    private readonly region: "americas" | "europe" | "asia"
  ) {}

  private get baseUrl(): string {
    return REGION_BASE_URLS[this.region];
  }

  /**
   * Create a client using the stored tokens.
   * Performs a single transparent refresh on 401 before failing (D22).
   */
  static async fromStoredTokens(): Promise<BlizzardClient> {
    const tokens = await loadTokens();
    if (!tokens) {
      throw new Error("No Battle.net tokens found. Sign in at /settings to connect your account.");
    }
    return new BlizzardClient(tokens.accessToken, tokens.region);
  }

  /**
   * Fetch the authenticated user's D4 profile (hero roster).
   * On 401, attempts one token refresh (D22).
   */
  async fetchProfile(): Promise<BnetProfile> {
    return this.fetchWithRefresh<BnetProfile>(
      `${this.baseUrl}/profile/d4/v1/profile`
    );
  }

  /**
   * Fetch a specific hero's detail (class, level, skills).
   */
  async fetchHero(heroId: number, realmSlug: string): Promise<BnetHero> {
    return this.fetchWithRefresh<BnetHero>(
      `${this.baseUrl}/profile/d4/v1/profile/${realmSlug}/${heroId}/hero`
    );
  }

  /**
   * Fetch a hero's equipped items.
   */
  async fetchHeroItems(heroId: number, realmSlug: string): Promise<BnetHeroItems> {
    return this.fetchWithRefresh<BnetHeroItems>(
      `${this.baseUrl}/profile/d4/v1/profile/${realmSlug}/${heroId}/hero-items`
    );
  }

  /**
   * Single-pass transparent token refresh on 401 (D22).
   * If the refresh also fails, throws the original 401 error.
   */
  private async fetchWithRefresh<T>(url: string): Promise<T> {
    try {
      return await bnetFetch<T>(url, this.accessToken);
    } catch (err) {
      if (err instanceof BnetApiError && err.status === 401) {
        // One refresh attempt (D22)
        const refreshed = await this.tryRefresh();
        if (!refreshed) throw err;
        return bnetFetch<T>(url, this.accessToken);
      }
      throw err;
    }
  }

  /**
   * Attempt to refresh the access token. Updates this.accessToken in-place.
   * Returns true if successful, false if no refresh token or refresh fails.
   */
  private async tryRefresh(): Promise<boolean> {
    const tokens = await loadTokens();
    if (!tokens?.refreshToken) return false;

    let credentials: { clientId: string; clientSecret: string };
    try {
      credentials = getClientCredentials();
    } catch {
      return false;
    }

    try {
      const refreshed = await refreshAccessToken({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        refreshToken: tokens.refreshToken,
      });
      const saved = await saveTokens(refreshed, tokens.region);
      this.accessToken = saved.accessToken;
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Derive the realm slug from a hero's seasonal flag.
 * D4 realms: "seasonal" (current season) or "eternal".
 */
export function heroRealmSlug(seasonal: boolean): string {
  return seasonal ? "seasonal" : "eternal";
}
