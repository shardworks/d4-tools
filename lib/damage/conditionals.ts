/**
 * Conditional uptime and contribution helpers.
 *
 * Under boss-DPS framing (D15):
 *   - cc         → uptime 0.0 (boss immune to CC)
 *   - elite      → uptime 1.0 (boss is an elite)
 *   - vulnerable → configured uptime (default 0.90, D10)
 *   - distance-close  → 1.0 if class default is "close", else 0.0
 *   - distance-distant → 1.0 if class default is "distant", else 0.0
 *   - unconditional → uptime 1.0
 */

import type { DamageConfig } from "./config";
import type { AffixContribution, ConditionalApplied } from "./types";

/**
 * Returns the effective uptime for a given conditional type and class.
 */
export function resolveUptime(
  conditional: AffixContribution["conditional"],
  className: string,
  config: DamageConfig
): number {
  switch (conditional) {
    case "unconditional":
      return 1.0;
    case "cc":
      return config.uptimes["cc"] ?? 0.0;
    case "elite":
      return config.uptimes["elite"] ?? 1.0;
    case "vulnerable":
      return config.uptimes["vulnerable"] ?? 0.90;
    case "distance-close": {
      const dist = config.distanceDefault[className];
      return dist === "close" ? 1.0 : 0.0;
    }
    case "distance-distant": {
      const dist = config.distanceDefault[className];
      return dist === "distant" ? 1.0 : 0.0;
    }
    default:
      return 1.0;
  }
}

/**
 * Applies uptime weighting to a contribution's rolled value.
 * Returns the effective contribution value after uptime.
 */
export function applyUptime(
  rolledValue: number,
  conditional: AffixContribution["conditional"],
  className: string,
  config: DamageConfig
): number {
  return rolledValue * resolveUptime(conditional, className, config);
}

/**
 * Sums contributions in a given bucket with uptime weighting applied.
 * Used to compute the effective additive bucket total, crit stats, etc.
 */
export function sumBucketWithUptime(
  contributions: AffixContribution[],
  bucket: string,
  className: string,
  config: DamageConfig
): number {
  return contributions
    .filter((c) => c.bucket === bucket)
    .reduce(
      (sum, c) => sum + applyUptime(c.rolledValue, c.conditional, className, config),
      0
    );
}

/**
 * Builds the conditionalsApplied list for a skill result (D38).
 *
 * Groups contributions by conditional type, computes each type's total
 * weighted value (after uptime), and estimates its share of the additive
 * bucket contribution.
 *
 * Only non-unconditional contributions with non-zero uptime are listed.
 */
export function buildConditionalsApplied(
  contributions: AffixContribution[],
  bucket: string,
  className: string,
  config: DamageConfig
): ConditionalApplied[] {
  // Group by conditional type (excluding unconditional)
  const grouped = new Map<string, number>();
  let totalAdditive = 0;

  for (const c of contributions) {
    if (c.bucket !== bucket) continue;
    const uptime = resolveUptime(c.conditional, className, config);
    const weighted = c.rolledValue * uptime;
    totalAdditive += weighted;

    if (c.conditional !== "unconditional") {
      grouped.set(c.conditional, (grouped.get(c.conditional) ?? 0) + weighted);
    }
  }

  if (grouped.size === 0) return [];

  const result: ConditionalApplied[] = [];

  for (const [conditionalType, weightedSum] of grouped.entries()) {
    const uptime = resolveUptime(
      conditionalType as AffixContribution["conditional"],
      className,
      config
    );
    const contributionPct = totalAdditive > 0 ? weightedSum / totalAdditive : 0;

    result.push({
      type: conditionalType as ConditionalApplied["type"],
      uptime,
      contributionPct,
    });
  }

  return result;
}
