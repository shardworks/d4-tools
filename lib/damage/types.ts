/**
 * Damage engine type definitions.
 *
 * All types here describe engine inputs, intermediates, and outputs.
 * No I/O, no global state — pure data structures.
 */

// ─── Engine inputs ────────────────────────────────────────────────────────────

/**
 * Summary of all equipped affix/aspect contributions resolved to their
 * damage-engine bucket. Collected from all item slots for a character.
 */
export interface AffixContribution {
  /** Attribute identifier (eAttribute from catalog) */
  attribute: string;
  /** Rolled value for this affix or aspect instance */
  rolledValue: number;
  /** Target damage bucket */
  bucket: string;
  /**
   * Conditional type — governs how the engine applies this contribution
   * under boss-DPS framing (D15).
   */
  conditional: "unconditional" | "cc" | "distance-close" | "distance-distant" | "vulnerable" | "elite";
  /** True when this contribution comes from an aspect flagged as [×] distinct multiplier (D16) */
  isDistinctMultiplier?: boolean;
  /** Source slot ID (for debugging) */
  slotId?: string;
}

// ─── Per-skill conditional visibility ────────────────────────────────────────

/**
 * Records how a conditional contribution was applied for a specific skill.
 * Returned per-skill per D38 so the UI can show "Vulnerable: 0.90 uptime, contributes X%".
 */
export interface ConditionalApplied {
  /** Conditional type */
  type: "unconditional" | "cc" | "distance-close" | "distance-distant" | "vulnerable" | "elite";
  /** Uptime fraction applied (0.0 = zeroed, 1.0 = full, 0.9 = 90%) */
  uptime: number;
  /**
   * Contribution percentage of this conditional type's total bonus to
   * the overall DPS multiplier (0.0–1.0). Approximation — for display.
   */
  contributionPct: number;
}

// ─── Per-skill result ─────────────────────────────────────────────────────────

/**
 * Sustained boss DPS result for a single skill (D2, D38).
 */
export interface SkillDpsResult {
  /** Catalog skill ID */
  skillId: string;
  /** Display label */
  skillLabel: string;
  /** Skill rank (1–maxRank) */
  rank: number;
  /** Sustained boss DPS value for this skill */
  dps: number;
  /**
   * Bucket contribution breakdown (for the expandable UI panel, D20).
   * Keys are bucket names; values are the multiplicative factor contributed
   * by that bucket (1.0 = no contribution).
   */
  bucketContributions: Record<string, number>;
  /**
   * Per-skill conditional visibility (D38).
   * Only non-unconditional contributions that have a non-trivial uptime or
   * contribution are listed.
   */
  conditionalsApplied: ConditionalApplied[];
}

// ─── Engine output ────────────────────────────────────────────────────────────

/**
 * Output of computeBuildDps (D2).
 */
export interface BuildDpsResult {
  /** Per-skill results. Only damaging skills are included (D17). */
  perSkill: SkillDpsResult[];
  /**
   * Headline aggregate: max(per-skill DPS) — the dominant skill (D18).
   * 0 when the build has no damaging skills.
   */
  aggregate: number;
}
