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
 *   Base         = weaponDamage × skillDamageCoeff × effectiveAps × hitsPerCast
 *   weaponDamage = arithmetic mean of damage-contributing weapon slots (see below)
 *   AdditiveMult = 1 + (sum of additive bucket with uptime) + primaryStatBonus
 *   CritMult     = 1 + CSC × CSD  (EV form; CSC hard-capped at 100%)
 *   VulnMult     = 1 + vulnUptime × (vulnBaseline + rolledVulnBonus)
 *   DistinctMults = per-aspect [×]-tagged sources, each (1 + rolledValue)
 *
 * Weapon damage composition:
 *   All occupied slots in config.weaponSlotsByClass[className] are checked. A slot
 *   contributes iff its item carries at least one implicit with an affixId starting
 *   with "affix_weapon_damage_" (D3 detection rule). Each contributing weapon
 *   resolves its per-weapon value (rolledRange mean, or the legacy linear fallback
 *   100 + 1.5 × itemPower with a one-time console.warn when rolledRange is absent).
 *   The arithmetic mean of all contributing per-weapon values is taken. Single-weapon
 *   classes naturally collapse to a mean of one. APS reads from the first occupied
 *   slot (main-hand, by priority order) only.
 *
 * Excluded from v1:
 *   - Overpower (D24): OP = 0; requires Life+Fortify state
 *   - Paragon/glyph contributions (D25): ignores paragonAllocation
 *   - Movement speed (D31): no MS threshold interaction
 *   - Resource economy (D27): optimistic DPS assumes sustain
 */

import type { Item, AffixInstance } from "../schema";
import type { SkillEntry, AffixEntry, AspectEntry, UniqueEntry } from "../catalog";
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
 * Resolves all occupied weapon slots for DPS computation, in priority order.
 *
 * Iterates config.weaponSlotsByClass[className] and collects every slot that
 * has an item equipped. The first element of the returned array is the main-hand
 * weapon used for APS purposes (D7, D10). Returns an empty array when no weapon
 * slots are occupied.
 */
function resolveWeaponSlots(
  className: string,
  equippedItems: Record<string, Item>,
  config: DamageConfig
): Array<{ slotId: string; item: Item }> {
  const slots = config.weaponSlotsByClass[className] ?? ["weapon"];
  const result: Array<{ slotId: string; item: Item }> = [];
  for (const slotId of slots) {
    const item = equippedItems[slotId];
    if (item) result.push({ slotId, item });
  }
  return result;
}

/**
 * Finds the weapon-damage implicit affix on the item (if any).
 * Returns the first AffixInstance whose affixId starts with "affix_weapon_damage_".
 */
function findWeaponDamageImplicit(item: Item): AffixInstance | undefined {
  return [...(item.implicits ?? [])].find(
    (a) => a.affixId.startsWith("affix_weapon_damage_")
  );
}

/**
 * Module-level set tracking which item keys have already emitted the fallback warning.
 * Prevents repeated warnings for the same item across multiple computations.
 * Export for test cleanup via clearWeaponDamageFallbackWarnings().
 */
const warnedItemKeys = new Set<string>();

/**
 * Clears the fallback-warning deduplication set. Call in tests before each case.
 * @internal
 */
export function clearWeaponDamageFallbackWarnings(): void {
  warnedItemKeys.clear();
}

/**
 * Computes aggregate weapon base damage across all damage-contributing weapon slots.
 *
 * Detection rule (D3): a slot contributes iff its item has at least one implicit
 * whose affixId starts with "affix_weapon_damage_". Slots without this implicit
 * are silently skipped (focus-only loadouts, shields, etc.).
 *
 * Per-weapon value resolution (D6):
 *   - Primary path: reads rolledRange from the weapon-damage implicit → returns mean.
 *   - Fallback: when the implicit lacks rolledRange (stale data with rolledValue),
 *     uses the inlined linear formula (100 + 1.5 × itemPower), emitting ONE
 *     console.warn per item key.
 *
 * Aggregate: arithmetic mean of all contributing per-weapon values.
 * Returns 0 when no slot passes the D3 detection rule (D5).
 */
function computeWeaponDamage(
  weaponSlots: Array<{ slotId: string; item: Item }>,
  _config: DamageConfig
): number {
  const values: number[] = [];

  for (const { item } of weaponSlots) {
    const weaponImplicit = findWeaponDamageImplicit(item);
    if (!weaponImplicit) continue; // D3: no weapon-damage implicit → slot does not compose

    let perWeaponValue: number;
    if (weaponImplicit.rolledRange !== undefined) {
      perWeaponValue = (weaponImplicit.rolledRange[0] + weaponImplicit.rolledRange[1]) / 2;
    } else {
      // Fallback: inlined linear formula for stale items with rolledValue instead of rolledRange
      const itemKey = `${item.slot ?? "unknown"}:${item.name ?? "unnamed"}`;
      if (!warnedItemKeys.has(itemKey)) {
        warnedItemKeys.add(itemKey);
        console.warn(
          `[damage/formula] Weapon-damage implicit on item "${item.name ?? "(unnamed)"}" has no rolledRange. ` +
            "Falling back to legacy linear formula (100 + 1.5 × itemPower). " +
            "Update the item's implicit to use rolledRange for accurate DPS calculation."
        );
      }
      const ip = item.itemPower ?? 0;
      perWeaponValue = 100 + 1.5 * ip;
    }
    values.push(perWeaponValue);
  }

  if (values.length === 0) return 0; // D5: no damage-contributing slots → 0
  return values.reduce((sum, v) => sum + v, 0) / values.length;
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
  const weaponSlots = resolveWeaponSlots(className, equippedItems, config);

  // D7: If no weapons are equipped at all, short-circuit before the breakpoint path
  if (weaponSlots.length === 0) {
    return {
      skillId: skill.id,
      skillLabel: skill.label,
      rank,
      dps: 0,
      bucketContributions: {},
      conditionalsApplied: [],
    };
  }

  const weaponDamage = computeWeaponDamage(weaponSlots, config);

  if (weaponDamage <= 0) {
    // D5: Weapons equipped but none carry a weapon-damage implicit → zero DPS
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
  // APS reads from the main-hand only: the first occupied slot in priority order (D7, D10).
  const asMult = computeAsMultiplier(contributions);
  const mainHandSlotId = weaponSlots[0].slotId;
  const mainHandItem = weaponSlots[0].item;
  const effectiveAps = computeEffectiveAps(className, mainHandSlotId, asMult, config, mainHandItem);

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
  uniqueCatalog: UniqueEntry[],
  config: DamageConfig
): BuildDpsResult {
  // Collect all affix contributions once (shared across skills)
  const contributions = collectAllAffixContributions(
    equippedItems,
    affixCatalog,
    aspectCatalog,
    uniqueCatalog,
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
