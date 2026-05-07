/**
 * Blizzard D4 API types — observed shapes from the Battle.net Game Data API.
 *
 * These are NOT canonical TypeScript interfaces (per docs/data-sources/README.md §2.6).
 * They capture observed API response shapes for use by the client and import converter.
 * Fields marked optional may or may not be present in all responses.
 */

// ─── OAuth / token types ───────────────────────────────────────────────────

/** Stored token payload persisted to ${DATA_DIR}/blizzard-tokens.json (D3). */
export interface BnetTokens {
  /** Short-lived access token from OAuth flow. */
  accessToken: string;
  /** Long-lived refresh token (may not be present if Battle.net doesn't issue one). */
  refreshToken?: string;
  /** Unix timestamp (ms) when the access token expires. */
  expiresAt: number;
  /** The region this token was issued for. */
  region: "americas" | "europe" | "asia";
}

/** Raw token response from the Battle.net token endpoint. */
export interface BnetTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

// ─── Profile / hero roster ─────────────────────────────────────────────────

/** Summary of a hero as returned by the profile roster endpoint. */
export interface BnetHeroSummary {
  id: number;
  name: string;
  /** API class string (e.g. "sorcerer", "barbarian"). */
  class: string;
  level: number;
  paragonLevel: number;
  hardcore: boolean;
  /** true = Seasonal realm, false = Eternal realm */
  seasonal: boolean;
  dead: boolean;
  /** Season number this hero was created in (seasonal heroes only). */
  seasonCreatedIn?: number;
}

/** Response from GET /profile/d4/v1/profile (hero roster). */
export interface BnetProfile {
  heroes: BnetHeroSummary[];
  lastUpdatedTime?: number;
}

// ─── Hero detail ───────────────────────────────────────────────────────────

export interface BnetSkillEntry {
  /** Numeric sno ID — maps to SkillEntry.bnetId in the catalog. */
  id: number;
  name?: string;
}

export interface BnetHero {
  id: number;
  name: string;
  class: string;
  level: number;
  paragonLevel: number;
  hardcore: boolean;
  seasonal: boolean;
  dead: boolean;
  seasonCreatedIn?: number;
  skills?: {
    active?: BnetSkillEntry[];
    passive?: BnetSkillEntry[];
  };
}

// ─── Hero items ────────────────────────────────────────────────────────────

/** A single affix in an API item response. */
export interface BnetAffix {
  /** Numeric sno ID — maps to AffixEntry.bnetId in the catalog. */
  id: number;
  /** Rolled value of the affix. */
  value?: number;
}

/** An aspect / legendary power on an item. */
export interface BnetAspect {
  /** Numeric sno ID — maps to AspectEntry.bnetId in the catalog. */
  id: number;
  value?: number;
}

/** A single equipped item from the /hero-items response. */
export interface BnetItem {
  /** Numeric item sno ID. */
  id: number;
  /** Human-readable item name (not used for resolution). */
  name: string;
  /** Item quality/rarity string (e.g. "unique", "legendary", "rare"). */
  quality: string;
  /** Item power level. */
  power?: number;
  /** Whether this item is ancestral. */
  isAncestral?: boolean;
  /** Fixed intrinsic affixes. */
  implicits?: BnetAffix[];
  /** Rolled affixes. */
  explicits?: BnetAffix[];
  /** Tempered affix imprints (if reported separately; may be in explicits). */
  tempered?: BnetAffix[];
  /** Legendary / codex aspect. */
  aspect?: BnetAspect;
}

/**
 * Response from GET /profile/d4/v1/profile/{realmSlug}/{heroId}/hero-items.
 *
 * Keys are Blizzard slot keys (e.g. "head", "torso", "feet").
 * See SlotEntry.bnetSlotKey in the catalog for the mapping.
 */
export type BnetHeroItems = Record<string, BnetItem | undefined>;

// ─── Error helpers ─────────────────────────────────────────────────────────

/** Thrown when the Blizzard API returns a non-OK HTTP status. */
export class BnetApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message?: string
  ) {
    super(message ?? `Battle.net API error ${status}: ${body}`);
    this.name = "BnetApiError";
  }
}
