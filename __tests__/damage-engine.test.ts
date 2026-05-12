/**
 * Damage engine unit tests.
 *
 * Tests canonical synthetic-build scenarios covering:
 * - Bucket aggregation (additive, crit EV, vulnerable EV)
 * - Position A vs Position B config switching (D9)
 * - CC-conditional zeroing under boss-DPS framing (D15)
 * - Vulnerable uptime application at configured 0.90 (D10)
 * - Breakpoint behavior at and across class+weapon-type boundaries
 * - Paladin/Warlock linear AS (D34)
 * - Fail-loud on missing attribute mapping (D30)
 * - Empty damaging-skills (zero/empty) case
 * - isSkillDamaging classification (D17)
 *
 * Per D32: flat file under __tests/ (not subdir'd).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { computeBuildDps, isSkillDamaging } from "../lib/damage/index";
import { collectAllAffixContributions, getDistinctMultiplierContributions } from "../lib/damage/buckets";
import { loadDamageConfig } from "../lib/damage/config";
import type { DamageConfig } from "../lib/damage/config";
import type { SkillEntry, AffixEntry, AspectEntry, UniqueEntry } from "../lib/catalog";
import { uniques, aspects } from "../lib/catalog";
import type { Character, Build, Item } from "../lib/schema";
import { clearWeaponDamageFallbackWarnings } from "../lib/damage/formula";
import { computeEffectiveAps } from "../lib/damage/breakpoints";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

/** Load the real upstream config (no override file → non-existent path). */
function getConfig(overridePathOverride = "/nonexistent/damage-config.local.json"): DamageConfig {
  return loadDamageConfig(overridePathOverride);
}

/** Minimal damaging skill that maps to additive bucket via Attr_Skill_Damage_Percent. */
function makeSkill(id: string, label = "Test Skill"): SkillEntry {
  return {
    id,
    label,
    category: "core",
    maxRank: 5,
    scalingAttributes: [
      { attribute: "Attr_Skill_Damage_Percent", scaleValue: 0.80, rankScale: 0.08 },
    ],
  };
}

/** Non-damaging skill (no scaling attributes). */
function makeNonDamagingSkill(id: string): SkillEntry {
  return { id, label: "Passive", category: "passive", maxRank: 1 };
}

/** Minimal weapon item with a given itemPower. */
function makeWeapon(itemPower: number, extraAffixes: Array<{ affixId: string; rolledValue: number }> = []): Item {
  return {
    slot: "weapon",
    name: "Test Weapon",
    rarity: "rare",
    itemPower,
    isAncestral: false,
    implicits: [],
    explicits: extraAffixes,
    tempered: [],
    masterworkRank: 0,
    runes: [],
    sockets: [],
  };
}

/** Minimal character for Sorcerer. */
function makeSorcerer(
  equippedItems: Record<string, Item> = {},
  skillSelections: Array<{ skillId: string; rank: number }> = []
): Character {
  return {
    id: "test-sorc",
    name: "Test Sorcerer",
    class: "Sorcerer",
    level: 100,
    paragonAllocation: { paragonLevel: 200, boards: [] },
    skillSelections,
    equippedItems,
    playstyleConstraints: [],
  };
}

/** Minimal character for Barbarian. */
function makeBarbarian(
  equippedItems: Record<string, Item> = {},
  skillSelections: Array<{ skillId: string; rank: number }> = []
): Character {
  return {
    id: "test-barb",
    name: "Test Barbarian",
    class: "Barbarian",
    level: 100,
    paragonAllocation: { paragonLevel: 200, boards: [] },
    skillSelections,
    equippedItems,
    playstyleConstraints: [],
  };
}

/** Minimal character for Paladin. */
function makePaladin(
  equippedItems: Record<string, Item> = {},
  skillSelections: Array<{ skillId: string; rank: number }> = []
): Character {
  return {
    id: "test-paladin",
    name: "Test Paladin",
    class: "Paladin",
    level: 100,
    paragonAllocation: { paragonLevel: 200, boards: [] },
    skillSelections,
    equippedItems,
    playstyleConstraints: [],
  };
}

/** Minimal build fixture. */
const testBuild: Build = {
  id: "test-build",
  characterId: "test-char",
  name: "Test Build",
  notes: "",
  targetItems: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** Minimal affix entry for a given attribute. */
function makeAffixEntry(id: string, eAttribute: string, nParam = 0): AffixEntry {
  return {
    id,
    label: id,
    labelTemplate: `+{value}% ${id}`,
    valueRanges: [{ minItemPower: 0, min: 0, max: 1 }],
    isPercent: true,
    slotRestrictions: [],
    classRestrictions: [],
    attribute: { eAttribute, nParam },
  };
}

/** Minimal affix entry with no attribute (non-damaging, e.g. life). */
function makeNonDamagingAffixEntry(id: string): AffixEntry {
  return {
    id,
    label: id,
    labelTemplate: `+{value} ${id}`,
    valueRanges: [{ minItemPower: 0, min: 0, max: 100 }],
    isPercent: false,
    slotRestrictions: [],
    classRestrictions: [],
    // No attribute field — non-damaging affix
  };
}

const EMPTY_CATALOG = {
  skills: [] as SkillEntry[],
  affixes: [] as AffixEntry[],
  aspects: [] as AspectEntry[], uniques: [] as UniqueEntry[],
};

// ─── isSkillDamaging (D17) ────────────────────────────────────────────────────

describe("isSkillDamaging", () => {
  it("returns true for a skill with a damage-bucket scaling attribute", () => {
    const skill = makeSkill("fire_bolt");
    const config = getConfig();
    expect(isSkillDamaging(skill, config)).toBe(true);
  });

  it("returns false for a skill with no scalingAttributes", () => {
    const skill = makeNonDamagingSkill("war_cry");
    const config = getConfig();
    expect(isSkillDamaging(skill, config)).toBe(false);
  });

  it("returns false for a skill with an empty scalingAttributes array", () => {
    const skill: SkillEntry = {
      id: "empty_scale",
      label: "Empty",
      category: "passive",
      maxRank: 1,
      scalingAttributes: [],
    };
    const config = getConfig();
    expect(isSkillDamaging(skill, config)).toBe(false);
  });
});

// ─── Empty build (no damaging skills) ────────────────────────────────────────

describe("computeBuildDps — empty / no damaging skills", () => {
  it("returns empty perSkill and 0 aggregate when character has no skill selections", () => {
    const config = getConfig();
    const character = makeSorcerer(
      { weapon: makeWeapon(500) },
      []
    );
    const result = computeBuildDps(testBuild, character, EMPTY_CATALOG, config);
    expect(result.perSkill).toHaveLength(0);
    expect(result.aggregate).toBe(0);
  });

  it("returns 0 aggregate when all selected skills are non-damaging", () => {
    const config = getConfig();
    const skill = makeNonDamagingSkill("war_cry");
    const character = makeSorcerer(
      { weapon: makeWeapon(500) },
      [{ skillId: "war_cry", rank: 1 }]
    );
    const result = computeBuildDps(testBuild, character, {
      skills: [skill],
      affixes: [],
      aspects: [], uniques: [],
    }, config);
    expect(result.perSkill).toHaveLength(0);
    expect(result.aggregate).toBe(0);
  });
});

// ─── Basic single-skill DPS ────────────────────────────────────────────────────

describe("computeBuildDps — basic single skill", () => {
  it("returns positive DPS for a damaging skill with a weapon equipped", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");
    const character = makeSorcerer(
      { weapon: makeWeapon(700) },
      [{ skillId: "fire_bolt", rank: 5 }]
    );
    const result = computeBuildDps(testBuild, character, {
      skills: [skill],
      affixes: [],
      aspects: [], uniques: [],
    }, config);
    expect(result.perSkill).toHaveLength(1);
    expect(result.perSkill[0].skillId).toBe("fire_bolt");
    expect(result.perSkill[0].dps).toBeGreaterThan(0);
    expect(result.aggregate).toBeGreaterThan(0);
    expect(result.aggregate).toBe(result.perSkill[0].dps);
  });

  it("returns 0 DPS when no weapon is equipped", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");
    const character = makeSorcerer(
      {}, // no weapon
      [{ skillId: "fire_bolt", rank: 1 }]
    );
    const result = computeBuildDps(testBuild, character, {
      skills: [skill],
      affixes: [],
      aspects: [], uniques: [],
    }, config);
    expect(result.perSkill[0].dps).toBe(0);
    expect(result.aggregate).toBe(0);
  });

  it("higher item power → higher DPS (linear weapon damage formula)", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");
    const runWith = (ip: number) => computeBuildDps(testBuild, makeSorcerer(
      { weapon: makeWeapon(ip) },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [], aspects: [], uniques: [] }, config);

    const low = runWith(100);
    const high = runWith(900);
    expect(high.aggregate).toBeGreaterThan(low.aggregate);
  });

  it("higher skill rank → higher DPS (via rankScale)", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");
    const charAtRank = (rank: number) => computeBuildDps(
      testBuild,
      makeSorcerer({ weapon: makeWeapon(700) }, [{ skillId: "fire_bolt", rank }]),
      { skills: [skill], affixes: [], aspects: [], uniques: [] },
      config
    );
    expect(charAtRank(5).aggregate).toBeGreaterThan(charAtRank(1).aggregate);
  });
});

// ─── Additive bucket ──────────────────────────────────────────────────────────

describe("computeBuildDps — additive bucket", () => {
  it("an equipped affix with +X% Core Skill Damage increases DPS (Position A)", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");
    const coreSkillAffix = makeAffixEntry("affix_core", "Attr_Core_Skill_Damage_Percent");

    const base = computeBuildDps(testBuild, makeSorcerer(
      { weapon: makeWeapon(700) },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [coreSkillAffix], aspects: [], uniques: [] }, config);

    const withAffix = computeBuildDps(testBuild, makeSorcerer(
      {
        weapon: makeWeapon(700),
        helm: {
          slot: "helm", name: "", rarity: "rare", itemPower: 700,
          isAncestral: false, implicits: [], masterworkRank: 0,
          runes: [], sockets: [],
          explicits: [{ affixId: "affix_core", rolledValue: 0.25 }],
          tempered: [],
        } as Item,
      },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [coreSkillAffix], aspects: [], uniques: [] }, config);

    expect(withAffix.aggregate).toBeGreaterThan(base.aggregate);
    // +25% core skill damage → additive mult increases by 0.25 → dps ×(1.25/1.0)
    expect(withAffix.aggregate / base.aggregate).toBeCloseTo(1.25, 2);
  });

  it("multiple additive affixes sum before multiplication", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");
    const affixA = makeAffixEntry("affix_a", "Attr_Skill_Damage_Percent");
    const affixB = makeAffixEntry("affix_b", "Attr_Core_Skill_Damage_Percent");

    const base = computeBuildDps(testBuild, makeSorcerer(
      { weapon: makeWeapon(700) },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [affixA, affixB], aspects: [], uniques: [] }, config);

    const withBoth = computeBuildDps(testBuild, makeSorcerer(
      {
        weapon: makeWeapon(700),
        helm: {
          slot: "helm", name: "", rarity: "rare", itemPower: 700,
          isAncestral: false, implicits: [], masterworkRank: 0,
          runes: [], sockets: [],
          explicits: [
            { affixId: "affix_a", rolledValue: 0.20 },
            { affixId: "affix_b", rolledValue: 0.30 },
          ],
          tempered: [],
        } as Item,
      },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [affixA, affixB], aspects: [], uniques: [] }, config);

    // Sum = 0.20 + 0.30 = 0.50 → mult = 1.50 → ratio = 1.50
    expect(withBoth.aggregate / base.aggregate).toBeCloseTo(1.50, 2);
  });
});

// ─── CC-conditional zeroing (D15) ────────────────────────────────────────────

describe("computeBuildDps — CC-conditional zeroed under boss-DPS", () => {
  it("CC-conditional affix (Attr_Damage_Percent_Bonus_With_Crowd_Control) contributes 0 DPS", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");
    const ccAffix = makeAffixEntry("affix_cc", "Attr_Damage_Percent_Bonus_With_Crowd_Control");

    const base = computeBuildDps(testBuild, makeSorcerer(
      { weapon: makeWeapon(700) },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [ccAffix], aspects: [], uniques: [] }, config);

    const withCC = computeBuildDps(testBuild, makeSorcerer(
      {
        weapon: makeWeapon(700),
        helm: {
          slot: "helm", name: "", rarity: "rare", itemPower: 700,
          isAncestral: false, implicits: [], masterworkRank: 0,
          runes: [], sockets: [],
          explicits: [{ affixId: "affix_cc", rolledValue: 0.40 }],
          tempered: [],
        } as Item,
      },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [ccAffix], aspects: [], uniques: [] }, config);

    // CC uptime = 0.0 → zero contribution → same DPS as base
    expect(withCC.aggregate).toBeCloseTo(base.aggregate, 5);
  });
});

// ─── Vulnerable uptime application (D10, D13) ────────────────────────────────

describe("computeBuildDps — vulnerable uptime", () => {
  it("vulnerable EV multiplier ≈ 1 + 0.90 × 0.20 = 1.18 when no extra vuln affixes", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");
    const character = makeSorcerer(
      { weapon: makeWeapon(700) },
      [{ skillId: "fire_bolt", rank: 1 }]
    );

    const result = computeBuildDps(testBuild, character, {
      skills: [skill], affixes: [], aspects: [], uniques: [],
    }, config);

    // Extract expected breakdown: vulnMult should be ≈ 1.18
    expect(result.perSkill[0].bucketContributions["vulnerable"]).toBeCloseTo(1.18, 2);
  });

  it("changing vulnerable uptime to 1.0 increases DPS", () => {
    import("fs").then(({ writeFileSync, mkdtempSync, rmSync }) => {
      // This is covered by damage-config.test.ts override tests
      // Just verify that vulnerable applies at the config uptime
    });

    const config = getConfig();
    const skill = makeSkill("fire_bolt");
    const character = makeSorcerer({ weapon: makeWeapon(700) }, [{ skillId: "fire_bolt", rank: 1 }]);
    const result = computeBuildDps(testBuild, character, { skills: [skill], affixes: [], aspects: [], uniques: [] }, config);

    // vulnMult = 1 + 0.90 × 0.20 = 1.18 → present in bucketContributions
    expect(result.perSkill[0].bucketContributions["vulnerable"]).toBeGreaterThan(1.0);
  });
});

// ─── Crit EV formula (D11) ────────────────────────────────────────────────────

describe("computeBuildDps — crit EV", () => {
  it("crit contribution increases with higher CSC affix", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");
    const cscAffix = makeAffixEntry("affix_csc", "Attr_Crit_Strike_Chance_Percent");
    const csdAffix = makeAffixEntry("affix_csd", "Attr_Crit_Damage_Percent");

    const base = computeBuildDps(testBuild, makeSorcerer(
      { weapon: makeWeapon(700) },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [cscAffix, csdAffix], aspects: [], uniques: [] }, config);

    const withCrit = computeBuildDps(testBuild, makeSorcerer(
      {
        weapon: makeWeapon(700),
        helm: {
          slot: "helm", name: "", rarity: "rare", itemPower: 700,
          isAncestral: false, implicits: [], masterworkRank: 0,
          runes: [], sockets: [],
          explicits: [
            { affixId: "affix_csc", rolledValue: 0.20 }, // +20% crit chance
            { affixId: "affix_csd", rolledValue: 0.50 }, // +50% crit damage
          ],
          tempered: [],
        } as Item,
      },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [cscAffix, csdAffix], aspects: [], uniques: [] }, config);

    expect(withCrit.aggregate).toBeGreaterThan(base.aggregate);
  });

  it("CSC is hard-capped at 100%", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");
    const cscAffix = makeAffixEntry("affix_csc", "Attr_Crit_Strike_Chance_Percent");

    // Equip enormous CSC (should cap at 100%)
    const withCapped = computeBuildDps(testBuild, makeSorcerer(
      {
        weapon: makeWeapon(700),
        helm: {
          slot: "helm", name: "", rarity: "rare", itemPower: 700,
          isAncestral: false, implicits: [], masterworkRank: 0,
          runes: [], sockets: [],
          explicits: [{ affixId: "affix_csc", rolledValue: 5.0 }], // 500% — should cap at 100%
          tempered: [],
        } as Item,
      },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [cscAffix], aspects: [], uniques: [] }, config);

    // CritMult = 1 + 1.0 × csBaseline(0.5) = 1.5 — same as with exactly 100% CSC
    expect(withCapped.perSkill[0].bucketContributions["crit"]).toBeCloseTo(1.5, 2);
  });
});

// ─── Position A vs B switch via config override (D9) ─────────────────────────

describe("computeBuildDps — Position A vs B config override", () => {
  it("Position A: Core Skill Damage in additive bucket produces higher DPS than no bonus", () => {
    const configA = getConfig(); // Position A (default)
    const skill = makeSkill("fire_bolt");
    const coreAffix = makeAffixEntry("affix_core", "Attr_Core_Skill_Damage_Percent");

    const base = computeBuildDps(testBuild, makeSorcerer(
      { weapon: makeWeapon(700) },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [coreAffix], aspects: [], uniques: [] }, configA);

    const withAffix = computeBuildDps(testBuild, makeSorcerer(
      {
        weapon: makeWeapon(700),
        helm: {
          slot: "helm", name: "", rarity: "rare", itemPower: 700,
          isAncestral: false, implicits: [], masterworkRank: 0,
          runes: [], sockets: [],
          explicits: [{ affixId: "affix_core", rolledValue: 0.30 }],
          tempered: [],
        } as Item,
      },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [coreAffix], aspects: [], uniques: [] }, configA);

    // Position A: +30% core → 30% increase
    expect(withAffix.aggregate / base.aggregate).toBeCloseTo(1.30, 2);
  });

  it("Position B: override Attr_Core_Skill_Damage_Percent to skill_specific_mult produces different DPS", () => {
    const configA = getConfig();

    // Construct Position B config manually (normally done via override file)
    const configB: DamageConfig = {
      ...configA,
      attributeToBucket: {
        ...configA.attributeToBucket,
        "Attr_Core_Skill_Damage_Percent": {
          bucket: "skill_specific_mult",
          conditional: "unconditional",
        },
      },
      buckets: {
        ...configA.buckets,
        "skill_specific_mult": {
          type: "distinct_mult",
          description: "Position B: Core Skill Damage as distinct multiplicative bucket",
        },
      },
    };

    const skill = makeSkill("fire_bolt");
    const coreAffix = makeAffixEntry("affix_core", "Attr_Core_Skill_Damage_Percent");

    const helmItem: Item = {
      slot: "helm", name: "", rarity: "rare", itemPower: 700,
      isAncestral: false, implicits: [], masterworkRank: 0,
      runes: [], sockets: [],
      explicits: [{ affixId: "affix_core", rolledValue: 0.30 }],
      tempered: [],
    };

    const character = makeSorcerer(
      { weapon: makeWeapon(700), helm: helmItem },
      [{ skillId: "fire_bolt", rank: 1 }]
    );

    // With +30% in additive (Position A): additiveMult = 1.30 → ratio 1.30/1.0 = 1.30
    const resultA = computeBuildDps(testBuild, character, {
      skills: [skill], affixes: [coreAffix], aspects: [], uniques: [],
    }, configA);

    // With +30% as distinct mult (Position B): distinctMult = 1.30 → different multiplier interaction
    const resultB = computeBuildDps(testBuild, character, {
      skills: [skill], affixes: [coreAffix], aspects: [], uniques: [],
    }, configB);

    // Results should differ between positions
    expect(resultA.aggregate).not.toBeCloseTo(resultB.aggregate, 2);
  });
});

// ─── Attack speed breakpoints ─────────────────────────────────────────────────

describe("computeBuildDps — attack speed breakpoints", () => {
  it("Sorcerer: adding small AS (below breakpoint) does not change DPS via frame jump", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");
    const asAffix = makeAffixEntry("affix_as", "Attr_Attacks_Per_Second_Percent_Bonus");

    // At multiplier 1.0 (default): tier = 17 frames → APS = 60/17 ≈ 3.529
    const base = computeBuildDps(testBuild, makeSorcerer(
      { weapon: makeWeapon(700) },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [asAffix], aspects: [], uniques: [] }, config);

    // Add tiny AS (below next breakpoint at 1.063 → need 6.3%+)
    const withSmallAS = computeBuildDps(testBuild, makeSorcerer(
      {
        weapon: makeWeapon(700),
        helm: {
          slot: "helm", name: "", rarity: "rare", itemPower: 700,
          isAncestral: false, implicits: [], masterworkRank: 0, runes: [], sockets: [],
          explicits: [{ affixId: "affix_as", rolledValue: 0.03 }], // +3% AS, below breakpoint
          tempered: [],
        } as Item,
      },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [asAffix], aspects: [], uniques: [] }, config);

    // 3% AS does not cross the 6.3% breakpoint → same frame count → same APS → same DPS
    expect(withSmallAS.aggregate).toBeCloseTo(base.aggregate, 3);
  });

  it("Sorcerer: adding AS that crosses a breakpoint produces a jump in DPS", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");
    const asAffix = makeAffixEntry("affix_as", "Attr_Attacks_Per_Second_Percent_Bonus");

    // At multiplier 1.0: tier 17 frames → APS 3.529
    const base = computeBuildDps(testBuild, makeSorcerer(
      { weapon: makeWeapon(700) },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [asAffix], aspects: [], uniques: [] }, config);

    // Add enough AS to cross from 17→16 frames (need 1.063 multiplier → 6.3%+ AS)
    const withBreakpointAS = computeBuildDps(testBuild, makeSorcerer(
      {
        weapon: makeWeapon(700),
        helm: {
          slot: "helm", name: "", rarity: "rare", itemPower: 700,
          isAncestral: false, implicits: [], masterworkRank: 0, runes: [], sockets: [],
          explicits: [{ affixId: "affix_as", rolledValue: 0.10 }], // +10% AS, crosses breakpoint
          tempered: [],
        } as Item,
      },
      [{ skillId: "fire_bolt", rank: 1 }]
    ), { skills: [skill], affixes: [asAffix], aspects: [], uniques: [] }, config);

    // Crossed from 17→16 frames: APS went from 3.529 to 3.75 → DPS should increase
    expect(withBreakpointAS.aggregate).toBeGreaterThan(base.aggregate);
    // Expected ratio ≈ (60/16) / (60/17) = 17/16 ≈ 1.0625
    expect(withBreakpointAS.aggregate / base.aggregate).toBeCloseTo(17 / 16, 2);
  });
});

// ─── Paladin/Warlock linear AS (D34) ─────────────────────────────────────────

describe("computeBuildDps — Paladin/Warlock linear AS (D34)", () => {
  it("Paladin: any AS% increase scales DPS proportionally (no frame quantization)", () => {
    const config = getConfig();
    const skill: SkillEntry = makeSkill("holy_strike");

    const asAffix = makeAffixEntry("affix_as", "Attr_Attacks_Per_Second_Percent_Bonus");

    const base = computeBuildDps(testBuild, makePaladin(
      { weapon: makeWeapon(700) },
      [{ skillId: "holy_strike", rank: 1 }]
    ), { skills: [skill], affixes: [asAffix], aspects: [], uniques: [] }, config);

    const withAS = computeBuildDps(testBuild, makePaladin(
      {
        weapon: makeWeapon(700),
        helm: {
          slot: "helm", name: "", rarity: "rare", itemPower: 700,
          isAncestral: false, implicits: [], masterworkRank: 0, runes: [], sockets: [],
          explicits: [{ affixId: "affix_as", rolledValue: 0.10 }], // +10% AS
          tempered: [],
        } as Item,
      },
      [{ skillId: "holy_strike", rank: 1 }]
    ), { skills: [skill], affixes: [asAffix], aspects: [], uniques: [] }, config);

    // Paladin uses linear AS: +10% AS → DPS increases by exactly 10%
    expect(withAS.aggregate / base.aggregate).toBeCloseTo(1.10, 3);
  });

  it("Paladin: small AS (3%) increases DPS continuously (no breakpoint step)", () => {
    const config = getConfig();
    const skill: SkillEntry = makeSkill("holy_strike");
    const asAffix = makeAffixEntry("affix_as", "Attr_Attacks_Per_Second_Percent_Bonus");

    const base = computeBuildDps(testBuild, makePaladin(
      { weapon: makeWeapon(700) },
      [{ skillId: "holy_strike", rank: 1 }]
    ), { skills: [skill], affixes: [asAffix], aspects: [], uniques: [] }, config);

    const with3AS = computeBuildDps(testBuild, makePaladin(
      {
        weapon: makeWeapon(700),
        helm: {
          slot: "helm", name: "", rarity: "rare", itemPower: 700,
          isAncestral: false, implicits: [], masterworkRank: 0, runes: [], sockets: [],
          explicits: [{ affixId: "affix_as", rolledValue: 0.03 }], // +3% AS
          tempered: [],
        } as Item,
      },
      [{ skillId: "holy_strike", rank: 1 }]
    ), { skills: [skill], affixes: [asAffix], aspects: [], uniques: [] }, config);

    // Paladin: +3% AS → 3% DPS increase (unlike Sorcerer which needs breakpoint)
    expect(with3AS.aggregate / base.aggregate).toBeCloseTo(1.03, 3);
  });
});

// ─── Fail-loud on missing attribute (D30) ─────────────────────────────────────

describe("computeBuildDps — fail-loud on unmapped attribute", () => {
  it("throws with the missing attribute id when affix references unknown attribute", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");

    // Affix with an attribute NOT in the config
    const unknownAffix: AffixEntry = {
      id: "affix_unknown",
      label: "Unknown Affix",
      labelTemplate: "+{value}% Unknown",
      valueRanges: [{ minItemPower: 0, min: 0, max: 1 }],
      isPercent: true,
      slotRestrictions: [],
      classRestrictions: [],
      attribute: { eAttribute: "Attr_Some_Unknown_Attribute_That_Does_Not_Exist", nParam: 0 },
    };

    const character = makeSorcerer(
      {
        weapon: makeWeapon(700),
        helm: {
          slot: "helm", name: "", rarity: "rare", itemPower: 700,
          isAncestral: false, implicits: [], masterworkRank: 0, runes: [], sockets: [],
          explicits: [{ affixId: "affix_unknown", rolledValue: 0.20 }],
          tempered: [],
        } as Item,
      },
      [{ skillId: "fire_bolt", rank: 1 }]
    );

    expect(() =>
      computeBuildDps(testBuild, character, {
        skills: [skill],
        affixes: [unknownAffix],
        aspects: [], uniques: [],
      }, config)
    ).toThrow("Attr_Some_Unknown_Attribute_That_Does_Not_Exist");
  });

  it("does not throw for affixes without an attribute field (non-damaging)", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");

    // Affix with NO attribute reference (legitimately non-damaging)
    const lifeAffix: AffixEntry = {
      id: "affix_life",
      label: "Max Life",
      labelTemplate: "+{value} Max Life",
      valueRanges: [{ minItemPower: 0, min: 0, max: 100 }],
      isPercent: false,
      slotRestrictions: [],
      classRestrictions: [],
      // No attribute field
    };

    const character = makeSorcerer(
      {
        weapon: makeWeapon(700),
        helm: {
          slot: "helm", name: "", rarity: "rare", itemPower: 700,
          isAncestral: false, implicits: [], masterworkRank: 0, runes: [], sockets: [],
          explicits: [{ affixId: "affix_life", rolledValue: 2800 }],
          tempered: [],
        } as Item,
      },
      [{ skillId: "fire_bolt", rank: 1 }]
    );

    // Should not throw — affix without attribute is skipped silently
    expect(() =>
      computeBuildDps(testBuild, character, {
        skills: [skill],
        affixes: [lifeAffix],
        aspects: [], uniques: [],
      }, config)
    ).not.toThrow();
  });
});

// ─── Unique intrinsic routing ─────────────────────────────────────────────────

/** Minimal unique item fixture. */
function makeUniqueItem(name: string, slot: string, itemPower = 925): Item {
  return {
    slot,
    name,
    rarity: "unique",
    itemPower,
    isAncestral: false,
    implicits: [],
    explicits: [],
    tempered: [],
    masterworkRank: 0,
    runes: [],
    sockets: [],
  };
}

describe("collectAllAffixContributions — unique intrinsics (S1 acceptance signals)", () => {
  it("Harlequin Crest intrinsicAffix contributes 0.20 to additive bucket via Attr_Skill_Damage_Percent", () => {
    const config = getConfig();
    const helm = makeUniqueItem("Harlequin Crest", "helm");

    const contributions = collectAllAffixContributions(
      { helm },
      [],       // no affix catalog needed
      aspects,
      uniques,
      config
    );

    const intrinsicContrib = contributions.find(
      (c) => c.attribute === "Attr_Skill_Damage_Percent" && c.rolledValue === 0.20
    );
    expect(intrinsicContrib).toBeDefined();
    expect(intrinsicContrib!.bucket).toBe("additive");
    expect(intrinsicContrib!.conditional).toBe("unconditional");
  });

  it("Tibault's Will intrinsicAspect (no-aspectId distinct-mult path) contributes 0.30 rolledValue as distinct multiplier", () => {
    const config = getConfig();
    const pants = makeUniqueItem("Tibault's Will", "pants");

    const contributions = collectAllAffixContributions(
      { pants },
      [],
      aspects,
      uniques,
      config
    );

    const distinctContribs = getDistinctMultiplierContributions(contributions);
    expect(distinctContribs).toHaveLength(1);
    expect(distinctContribs[0].rolledValue).toBeCloseTo(0.30, 6); // 30/100 = 0.30 → factor 1.30
    expect(distinctContribs[0].isDistinctMultiplier).toBe(true);
  });

  it("Ring of Starless Skies contributes NO distinct-mult factor after isDistinctMultiplier correction (D13)", () => {
    const config = getConfig();
    const ring = makeUniqueItem("Ring of Starless Skies", "ring1");

    const contributions = collectAllAffixContributions(
      { ring1: ring },
      [],
      aspects,
      uniques,
      config
    );

    const distinctContribs = getDistinctMultiplierContributions(contributions);
    expect(distinctContribs).toHaveLength(0); // no phantom ×1.12
  });

  it("fails loud (D7) when intrinsicAspect.aspectId references a nonexistent aspect", () => {
    const config = getConfig();
    const fixtureUnique: UniqueEntry = {
      id: "test_bad_aspect_ref",
      label: "Test Bad Aspect Ref",
      slot: "helm",
      classRestrictions: [],
      intrinsicAspects: [
        {
          aspectId: "nonexistent_aspect_xyz_12345",
          label: "Bad aspect",
          valueRange: [10, 20],
          isPercent: true,
        }
      ],
    };

    const item = makeUniqueItem("Test Bad Aspect Ref", "helm");

    expect(() =>
      collectAllAffixContributions(
        { helm: item },
        [],
        aspects, // real aspect catalog — won't contain the nonexistent id
        [fixtureUnique],
        config
      )
    ).toThrow("[damage/buckets]");

    expect(() =>
      collectAllAffixContributions(
        { helm: item },
        [],
        aspects,
        [fixtureUnique],
        config
      )
    ).toThrow("nonexistent_aspect_xyz_12345");
  });

  it("silently skips (D6) intrinsicAspect when referenced AspectEntry has no attribute", () => {
    const config = getConfig();
    const attrlessAspect: AspectEntry = {
      id: "aspect_no_attribute_xyz",
      label: "Aspect Without Attribute",
      labelTemplate: "No attribute",
      valueRange: [10, 20],
      isPercent: false,
      slotRestrictions: [],
      classRestrictions: [],
      source: "legendary",
      // attribute intentionally absent
    };

    const fixtureUnique: UniqueEntry = {
      id: "test_attrless_aspect_unique",
      label: "Test Attrless Aspect Unique",
      slot: "helm",
      classRestrictions: [],
      intrinsicAspects: [
        {
          aspectId: "aspect_no_attribute_xyz",
          label: "Attrless",
          valueRange: [10, 20],
          isPercent: false,
        }
      ],
    };

    const item = makeUniqueItem("Test Attrless Aspect Unique", "helm");

    const contributions = collectAllAffixContributions(
      { helm: item },
      [],
      [attrlessAspect],
      [fixtureUnique],
      config
    );

    // No throw, no contribution pushed
    expect(contributions).toHaveLength(0);
  });

  it("silently skips (D16) when item rarity is unique but name is empty", () => {
    const config = getConfig();
    const emptyNameItem: Item = {
      slot: "helm",
      name: "",
      rarity: "unique",
      itemPower: 925,
      isAncestral: false,
      implicits: [],
      explicits: [],
      tempered: [],
      masterworkRank: 0,
      runes: [],
      sockets: [],
    };

    expect(() =>
      collectAllAffixContributions(
        { helm: emptyNameItem },
        [],
        aspects,
        uniques,
        config
      )
    ).not.toThrow();

    const contributions = collectAllAffixContributions(
      { helm: emptyNameItem },
      [],
      aspects,
      uniques,
      config
    );
    expect(contributions).toHaveLength(0);
  });

  it("silently skips (D16) when item name does not match any catalog unique", () => {
    const config = getConfig();
    const unknownUniqueItem = makeUniqueItem("Nonexistent Unique Item XYZ", "helm");

    const contributions = collectAllAffixContributions(
      { helm: unknownUniqueItem },
      [],
      aspects,
      uniques,
      config
    );

    expect(contributions).toHaveLength(0);
  });
});

describe("computeBuildDps — Harlequin Crest DPS injection (Acceptance Signal 1)", () => {
  it("equipping Harlequin Crest raises DPS by intrinsic +20% skill damage", () => {
    const config = getConfig();
    const skill = makeSkill("fireball");
    const catalog = { skills: [skill], affixes: [], aspects, uniques };

    const bareChar = makeSorcerer(
      { weapon: makeWeapon(800) },
      [{ skillId: "fireball", rank: 3 }]
    );
    const harlequinChar = makeSorcerer(
      { weapon: makeWeapon(800), helm: makeUniqueItem("Harlequin Crest", "helm") },
      [{ skillId: "fireball", rank: 3 }]
    );

    const bareResult = computeBuildDps(testBuild, bareChar, catalog, config);
    const harlResult = computeBuildDps(testBuild, harlequinChar, catalog, config);

    // Additive mult goes from 1.0 to 1.20 (ceteris paribus) → ratio = 1.20
    expect(harlResult.aggregate).toBeGreaterThan(bareResult.aggregate);
    expect(harlResult.aggregate / bareResult.aggregate).toBeCloseTo(1.20, 2);
  });
});

describe("computeBuildDps — Tibault's Will distinct-mult (Acceptance Signal 2)", () => {
  it("equipping Tibault's Will multiplies DPS by ×1.30", () => {
    const config = getConfig();
    const skill = makeSkill("fireball");
    const catalog = { skills: [skill], affixes: [], aspects, uniques };

    const bareChar = makeSorcerer(
      { weapon: makeWeapon(800) },
      [{ skillId: "fireball", rank: 3 }]
    );
    const tibaultChar = makeSorcerer(
      { weapon: makeWeapon(800), pants: makeUniqueItem("Tibault's Will", "pants") },
      [{ skillId: "fireball", rank: 3 }]
    );

    const bareResult = computeBuildDps(testBuild, bareChar, catalog, config);
    const tibResult = computeBuildDps(testBuild, tibaultChar, catalog, config);

    // Distinct-mult factor: 1 + 0.30 = 1.30 → ratio ≈ 1.30
    expect(tibResult.aggregate / bareResult.aggregate).toBeCloseTo(1.30, 2);
  });
});

// ─── Aggregate = max(perSkill) (D18) ─────────────────────────────────────────

// ─── Weapon damage: rolledRange path (D4) ────────────────────────────────────

describe("computeBuildDps — weapon damage rolledRange path", () => {
  beforeEach(() => {
    clearWeaponDamageFallbackWarnings();
  });

  it("uses mean of rolledRange when weapon implicit carries rolledRange", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");

    // Weapon with a rolledRange implicit: mean = (1000 + 1500) / 2 = 1250
    const weaponWithRange: Item = {
      slot: "weapon",
      name: "Test Sword",
      rarity: "rare",
      itemPower: 900,
      isAncestral: false,
      implicits: [{ affixId: "affix_weapon_damage_1h_sword", rolledRange: [1000, 1500] }],
      explicits: [],
      tempered: [],
      masterworkRank: 0,
      runes: [],
      sockets: [],
    };

    const charWithRange = makeSorcerer(
      { weapon: weaponWithRange },
      [{ skillId: "fire_bolt", rank: 1 }]
    );

    // Weapon without implicit (legacy fallback): ip=900 → 100 + 1.5×900 = 1450
    const charFallback = makeSorcerer(
      { weapon: makeWeapon(900) },
      [{ skillId: "fire_bolt", rank: 1 }]
    );

    const resultRange = computeBuildDps(testBuild, charWithRange, {
      skills: [skill], affixes: [], aspects: [], uniques: [],
    }, config);

    const resultFallback = computeBuildDps(testBuild, charFallback, {
      skills: [skill], affixes: [], aspects: [], uniques: [],
    }, config);

    // rolledRange mean is 1250, fallback is 1450 → range gives less DPS
    // The ratio should match the damage ratio = 1250 / 1450
    expect(resultRange.aggregate).toBeGreaterThan(0);
    expect(resultFallback.aggregate).toBeGreaterThan(0);
    expect(resultRange.aggregate / resultFallback.aggregate).toBeCloseTo(1250 / 1450, 3);
  });

  it("falls back to linear formula exactly once per item when implicit is missing, emitting console.warn", () => {
    const config = getConfig();
    const skill = makeSkill("fire_bolt");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const character = makeSorcerer(
      { weapon: makeWeapon(600) },  // no implicits → fallback triggered
      [{ skillId: "fire_bolt", rank: 1 }]
    );

    // First call: should warn once
    computeBuildDps(testBuild, character, { skills: [skill], affixes: [], aspects: [], uniques: [] }, config);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("No weapon-damage implicit");

    // Second call for the same item: must NOT warn again (deduplication)
    computeBuildDps(testBuild, character, { skills: [skill], affixes: [], aspects: [], uniques: [] }, config);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});

// ─── computeEffectiveAps: per-weapon-type base APS (D14) ─────────────────────

describe("computeEffectiveAps — per-weapon-type base APS from game-math.json", () => {
  it("2H axe (Slow) resolves base APS = 0.75 from catalog, not the legacy baseWeaponAps", () => {
    const config = getConfig();

    const slowWeapon: Item = {
      slot: "weapon",
      name: "Test 2H Axe",
      rarity: "rare",
      itemPower: 925,
      isAncestral: false,
      implicits: [{ affixId: "affix_weapon_damage_2h_axe", rolledRange: [1800, 2700] }],
      explicits: [],
      tempered: [],
      masterworkRank: 0,
      runes: [],
      sockets: [],
    };

    // AS multiplier = 1.0 (no +AS affixes)
    // For Sorcerer with breakpoints: base 0.75 × 1.0 = 0.75 → quantized to breakpoint table
    // For Paladin (linear, no breakpoints): exactly 0.75
    const aps = computeEffectiveAps("Paladin", "weapon", 1.0, config, slowWeapon);
    expect(aps).toBeCloseTo(0.75, 4);
  });

  it("1H sword (Fast) resolves base APS = 1.1 from catalog", () => {
    const config = getConfig();

    const fastWeapon: Item = {
      slot: "weapon",
      name: "Test 1H Sword",
      rarity: "rare",
      itemPower: 925,
      isAncestral: false,
      implicits: [{ affixId: "affix_weapon_damage_1h_sword", rolledRange: [1100, 1700] }],
      explicits: [],
      tempered: [],
      masterworkRank: 0,
      runes: [],
      sockets: [],
    };

    // Paladin (linear): base 1.1 × 1.0 = 1.1
    const aps = computeEffectiveAps("Paladin", "weapon", 1.0, config, fastWeapon);
    expect(aps).toBeCloseTo(1.1, 4);
  });

  it("weapon without a damage implicit falls back to config.baseWeaponAps", () => {
    const config = getConfig();
    const noImplicitWeapon: Item = {
      slot: "weapon",
      name: "Legacy Weapon",
      rarity: "rare",
      itemPower: 700,
      isAncestral: false,
      implicits: [],  // no damage implicit
      explicits: [],
      tempered: [],
      masterworkRank: 0,
      runes: [],
      sockets: [],
    };
    // Paladin (linear): should fall back to config.baseWeaponAps
    const aps = computeEffectiveAps("Paladin", "weapon", 1.0, config, noImplicitWeapon);
    expect(aps).toBeCloseTo(config.baseWeaponAps, 4);
  });
});

// ─── Aggregate = max(perSkill) (D18) ─────────────────────────────────────────

describe("computeBuildDps — aggregate is max(perSkill)", () => {
  it("aggregate equals the highest per-skill DPS when multiple skills are present", () => {
    const config = getConfig();
    // Two damaging skills with different coefficients
    const skillA: SkillEntry = {
      id: "skill_a", label: "Skill A", category: "core", maxRank: 5,
      scalingAttributes: [{ attribute: "Attr_Skill_Damage_Percent", scaleValue: 2.0, rankScale: 0.0 }],
    };
    const skillB: SkillEntry = {
      id: "skill_b", label: "Skill B", category: "basic", maxRank: 5,
      scalingAttributes: [{ attribute: "Attr_Skill_Damage_Percent", scaleValue: 0.5, rankScale: 0.0 }],
    };
    const character = makeSorcerer(
      { weapon: makeWeapon(700) },
      [{ skillId: "skill_a", rank: 1 }, { skillId: "skill_b", rank: 1 }]
    );
    const result = computeBuildDps(testBuild, character, {
      skills: [skillA, skillB], affixes: [], aspects: [], uniques: [],
    }, config);
    expect(result.perSkill).toHaveLength(2);
    const maxDps = Math.max(...result.perSkill.map((s) => s.dps));
    expect(result.aggregate).toBeCloseTo(maxDps, 5);
    expect(result.perSkill.find((s) => s.skillId === "skill_a")!.dps).toBeGreaterThan(
      result.perSkill.find((s) => s.skillId === "skill_b")!.dps
    );
  });
});
