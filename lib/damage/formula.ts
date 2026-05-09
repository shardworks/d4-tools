/**
 * Core damage formula.
 *
 * Implements the D4 multiplicative-bucket DPS formula for sustained boss damage
 * per docs/scoring-engine.md §5.
 *
 * Formula (boss-DPS framing):
 *   Final = Base × AdditiveMult × CritMult × VulnMult × Π(DistinctMults)
 *
 * Where:
 *   Base        = weaponDamage × skillDamageCoeff × effectiveAps × hitsPerCast
 *   AdditiveMult = 1 + (sum of additive bucket with uptime) + primaryStatBonus
 *   CritMult    = 1 + CSC × CSD  (EV form; CSC hard-capped at 100%)
 *   VulnMult    = 1 + vulnUptime × (vulnBaseline + rolledVulnBonus)
 *   DistinctMults = per-aspect [×]-tagged sources, each (1 + rolledValue)
 *
 * Excluded from v1:
 *   - Overpower (D24): OP = 0; requires Life+Fortify state
 *   - Paragon/glyph contributions (D25): ignores paragonAllocation
 *   - Movement speed (D31): no MS threshold interaction
 *   - Resource economy (D27): optimistic DPS assumes sustain
 */

import type { Item } from "../schema";
import type { SkillEntry, AffixEntry, AspectEntry } from "../catalog";
import type { DamageConfig } from "./config";
import type { AffixContribution, BuildDpsResult, SkillDpsResult } from "./types";
import {
  collectAllAffixContributions,
  getDistinctMultiplierContributions,
  sumPrimaryStat,
} from "./buckets";
import {
  computeAsMultiplier,
  computeEffectiveAps,
} from "./breakpoints";
import {
  sumBucketWithUptime,
  resolveUptime,
  buildConditionalsApplied,
} from "./conditionals";

// ─── Weapon helpers ───────────────────────────────────────────────────────────

/**
 * Resolves the weapon slot and item to use for DPS computation.
 * Uses the class's primary weapon slots in priority order (weaponSlotsByClass).
 * Returns the first occupied slot, or undefined if no weapon is equipped.
 */
function resolveWeaponSlot(
  className: string,
  equippedItems: Record<string, Item>,
  config: DamageConfig
): { slotId: string; item: Item } | undefined {
  const slots = config.weaponSlotsByClass[className] ?? ["weapon"];
  for (const slotId of slots) {
    const item = equippedItems[slotId];
    if (item) return { slotId, item };
  }
  return undefined;
}

/**
 * Derives weapon DPS from itemPower using the configured formula (D26).
 * v1: linear model — weaponDamage = baseAtIlvl0 + slopePerIlvl × itemPower.
 */
function computeWeaponDamage(item: Item, config: DamageConfig): number {
  const ip = item.itemPower ?? 0;
  const { type, slopePerIlvl, baseAtIlvl0 } = config.itemPowerFormula;
  if (type === "linear") {
    return baseAtIlvl0 + slopePerIlvl * ip;
  }
  // Future formula types would be handled here
  return baseAtIlvl0 + slopePerIlvl * ip;
}

// ─── Skill damage coefficient ─────────────────────────────────────────────────

/**
 * Computes the skill's total damage coefficient at a given rank.
 * Formula per attribute: coeff = scaleValue + rankScale × (rank - 1)
 * Sums coefficients from ALL scaling attributes whose attribute maps
 * to a damage bucket (additive, distinct_mult, or conditional_mult).
 *
 * Returns 0 if no damage attribute is found (non-damaging skill).
 */
function computeSkillDamageCoeff(
  skill: SkillEntry,
  rank: number,
  config: DamageConfig
): number {
  if (!skill.scalingAttributes) return 0;

  let totalCoeff = 0;
  for (const sa of skill.scalingAttributes) {
    const bucketEntry = config.attributeToBucket[sa.attribute];
    if (!bucketEntry) continue;
    const { type } = config.buckets[bucketEntry.bucket] ?? {};
    // A skill is damaging if its scaling attribute resolves to additive or distinct_mult bucket
    if (type === "additive" || type === "distinct_mult" || type === "conditional_mult") {
      const actualRank = Math.max(1, rank);
      totalCoeff += sa.scaleValue + sa.rankScale * (actualRank - 1);
    }
  }
  return totalCoeff;
}

/**
 * Returns true when the skill has at least one scaling attribute that maps
 * to a damage bucket in the config (D17).
 */
export function isSkillDamaging(
  skill: SkillEntry,
  config: DamageConfig
): boolean {
  return computeSkillDamageCoeff(skill, 1, config) > 0;
}

// ─── Per-skill DPS computation ────────────────────────────────────────────────

/**
 * Computes sustained boss DPS for a single skill.
 *
 * @param skill          - Skill catalog entry
 * @param rank           - Equipped skill rank (1–maxRank)
 * @param className      - Character class
 * @param equippedItems  - Character's equipped items
 * @param contributions  - Pre-collected affix contributions (pass from caller)
 * @param config         - Resolved damage config
 * @returns              - SkillDpsResult or null if skill is non-damaging
 */
function computeSkillDps(
  skill: SkillEntry,
  rank: number,
  className: string,
  equippedItems: Record<string, Item>,
  contributions: AffixContribution[],
  config: DamageConfig
): SkillDpsResult | null {
  const damageCoeff = computeSkillDamageCoeff(skill, rank, config);
  if (damageCoeff <= 0) return null; // non-damaging skill

  // ── Weapon damage ──
  const weaponResult = resolveWeaponSlot(className, equippedItems, config);
  const weaponDamage = weaponResult
    ? computeWeaponDamage(weaponResult.item, config)
    : 0;

  if (weaponDamage <= 0) {
    // No weapon equipped — base DPS is zero; still report the skill as damaging
    return {
      skillId: skill.id,
      skillLabel: skill.label,
      rank,
      dps: 0,
      bucketContributions: {},
      conditionalsApplied: [],
    };
  }

  // ── Attack speed ──
  const asMult = computeAsMultiplier(contributions);
  const weaponSlot = weaponResult?.slotId ?? "weapon";
  const effectiveAps = computeEffectiveAps(className, weaponSlot, asMult, config);

  // ── Base DPS ──
  // v1: hitsPerCast = 1 (no multi-hit modeling for most skills)
  const hitsPerCast = 1;
  const baseDps = weaponDamage * damageCoeff * effectiveAps * hitsPerCast;

  // ── Additive bucket (with uptime) ──
  const additiveRaw = sumBucketWithUptime(contributions, "additive", className, config);

  // ── Primary stat contribution ──
  const primaryStatAttr = config.classPrimaryStats[className] ?? "";
  const totalPrimaryStat = sumPrimaryStat(contributions, primaryStatAttr);
  const primaryStatBonus = totalPrimaryStat * config.primaryStatScalar;

  const additiveMult = 1 + additiveRaw + primaryStatBonus;

  // ── Critical Strike EV (D11) ──
  // EV multiplier = 1 + CSC × CSD (where CSC hard-capped at 100%)
  const totalCsc = Math.min(
    1.0,
    config.constants.critBaseChance +
    sumBucketWithUptime(contributions, "crit_chance", className, config)
  );
  const totalCsd =
    config.constants.csBaseline +
    sumBucketWithUptime(contributions, "crit_damage", className, config);
  const critMult = 1 + totalCsc * totalCsd;

  // ── Vulnerable EV (D10, D13) ──
  // Additional vulnerable damage from affixes (Attr_Vuln_Damage_Percent)
  const rolledVulnBonus = contributions
    .filter((c) => c.bucket === "vulnerable")
    .reduce((sum, c) => {
      const uptime = resolveUptime(c.conditional, className, config);
      return sum + c.rolledValue * uptime;
    }, 0);
  const vulnUptime = config.uptimes["vulnerable"] ?? 0.90;
  const vulnBaseline = config.constants.vulnerableBaseline;
  // EV: 1 + vulnUptime × (baseline + rolledBonus)
  const vulnMult = 1 + vulnUptime * (vulnBaseline + rolledVulnBonus);

  // ── Distinct multiplicative sources ──
  // Each [×]-tagged aspect contributes its own multiplicative bucket (D16)
  const distinctContribs = getDistinctMultiplierContributions(contributions);
  let distinctProduct = 1.0;
  for (const dc of distinctContribs) {
    distinctProduct *= 1 + dc.rolledValue;
  }

  // ── Enemy defense (placeholder 1.0 in v1) ──
  const enemyDefenseMult = config.constants.enemyDefenseMultiplier ?? 1.0;

  // ── Final DPS ──
  const finalDps =
    baseDps *
    additiveMult *
    critMult *
    vulnMult *
    distinctProduct *
    enemyDefenseMult;

  // ── Bucket contributions (for UI breakdown, D20) ──
  const bucketContributions: Record<string, number> = {
    additive: additiveMult,
    crit: critMult,
    vulnerable: vulnMult,
    distinct: distinctProduct,
    enemyDefense: enemyDefenseMult,
  };

  // ── Conditionals applied (D38) ──
  const conditionalsApplied = buildConditionalsApplied(
    contributions,
    "additive",
    className,
    config
  );

  return {
    skillId: skill.id,
    skillLabel: skill.label,
    rank,
    dps: finalDps,
    bucketContributions,
    conditionalsApplied,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Computes sustained boss DPS for all damaging skills in a build.
 *
 * Pure function — no I/O, no global state.
 *
 * @param skills         - All skills for the character's class (from catalog)
 * @param skillRankMap   - Map of skillId → rank for skills selected in the build
 * @param className      - Character class name
 * @param equippedItems  - Character's equipped items
 * @param affixCatalog   - Full affix catalog
 * @param aspectCatalog  - Full aspect catalog
 * @param config         - Resolved damage config
 * @returns              - BuildDpsResult with perSkill results and aggregate
 * @throws               - When an equipped affix references an unmapped attribute (D30)
 */
export function computeBuildDpsFromParts(
  skills: SkillEntry[],
  skillRankMap: Map<string, number>,
  className: string,
  equippedItems: Record<string, Item>,
  affixCatalog: AffixEntry[],
  aspectCatalog: AspectEntry[],
  config: DamageConfig
): BuildDpsResult {
  // Collect all affix contributions once (shared across skills)
  const contributions = collectAllAffixContributions(
    equippedItems,
    affixCatalog,
    aspectCatalog,
    config
  );

  const perSkill: SkillDpsResult[] = [];

  for (const skill of skills) {
    const rank = skillRankMap.get(skill.id) ?? 0;
    if (rank === 0) continue; // skill not selected

    const result = computeSkillDps(
      skill,
      rank,
      className,
      equippedItems,
      contributions,
      config
    );

    if (result !== null) {
      perSkill.push(result);
    }
  }

  // Aggregate = max(per-skill DPS) per D18
  const aggregate =
    perSkill.length > 0 ? Math.max(...perSkill.map((s) => s.dps)) : 0;

  return { perSkill, aggregate };
}
