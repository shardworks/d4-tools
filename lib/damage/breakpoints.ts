/**
 * Attack speed breakpoint helpers.
 *
 * D4 runs at 60 fps. Per-class per-weapon-type breakpoint tables define
 * discrete frame counts. The effective APS is quantized to these tiers.
 *
 * Paladin and Warlock are intentionally excluded from breakpoint modeling
 * (D34): their AS is treated as a plain linear multiplier.
 *
 * Sources: Maxroll Attack Speed Mechanics (Season 11, Jan 7, 2026).
 * Not yet updated for Paladin/Warlock in Season 13.
 */

import type { DamageConfig, BreakpointTier } from "./config";
import type { AffixContribution } from "./types";

/** Frame rate used for breakpoint calculations. */
const FPS = 60;

/** Classes that use breakpoint tables (all except Paladin and Warlock per D34). */
const BREAKPOINT_CLASSES = new Set([
  "Barbarian",
  "Druid",
  "Necromancer",
  "Rogue",
  "Sorcerer",
  "Spiritborn",
]);

/**
 * Resolves the weapon type key for breakpoint table lookup.
 * Returns "1h" or "2h" based on the weapon slot used (D34).
 */
function resolveWeaponTypeKey(weaponSlot: string, config: DamageConfig): string {
  return config.weaponTypeBySlot[weaponSlot] ?? "1h";
}

/**
 * Returns the breakpoint table for a given class and weapon type key.
 * Falls back to "default" if the specific weapon type is not in the table.
 */
function getBreakpointTable(
  className: string,
  weaponTypeKey: string,
  config: DamageConfig
): BreakpointTier[] | undefined {
  const classTable = config.breakpoints[className];
  if (!classTable) return undefined;
  return classTable[weaponTypeKey] ?? classTable["default"];
}

/**
 * Sums all attack-speed contributions into a total AS multiplier.
 * All +AS% affixes are additive with each other (Maxroll AS Mechanics).
 */
export function computeAsMultiplier(contributions: AffixContribution[]): number {
  const totalASPercent = contributions
    .filter((c) => c.bucket === "attack_speed")
    .reduce((sum, c) => sum + c.rolledValue, 0);
  return 1 + totalASPercent;
}

/**
 * Computes effective attacks-per-second for a skill.
 *
 * For classes with breakpoint tables: quantizes APS to 60fps frame grid.
 * For Paladin/Warlock (D34): returns linear APS (no frame quantization).
 *
 * @param className      - Character class name
 * @param weaponSlot     - Equipped weapon slot ID used for the skill
 * @param asMult         - Total AS multiplier (1 + sum of all +AS%)
 * @param config         - Resolved damage config
 * @returns              - Effective attacks per second
 */
export function computeEffectiveAps(
  className: string,
  weaponSlot: string,
  asMult: number,
  config: DamageConfig
): number {
  const baseAps = config.baseWeaponAps;
  const rawAps = baseAps * asMult;

  // Paladin and Warlock: linear AS, no frame quantization (D34)
  if (!BREAKPOINT_CLASSES.has(className)) {
    return rawAps;
  }

  const weaponTypeKey = resolveWeaponTypeKey(weaponSlot, config);
  const table = getBreakpointTable(className, weaponTypeKey, config);

  if (!table || table.length === 0) {
    // No table available: fall back to linear (should not happen for covered classes)
    return rawAps;
  }

  // Find the highest tier whose minMultiplier ≤ asMult
  let activeTier = table[0];
  for (const tier of table) {
    if (asMult >= tier.minMultiplier) {
      activeTier = tier;
    } else {
      break;
    }
  }

  // Effective APS = 60 / framesPerAttack
  return FPS / activeTier.framesPerAttack;
}

/**
 * Returns whether a class uses linear AS (no breakpoint quantization).
 * True for Paladin and Warlock (D34).
 */
export function usesLinearAs(className: string): boolean {
  return !BREAKPOINT_CLASSES.has(className);
}
