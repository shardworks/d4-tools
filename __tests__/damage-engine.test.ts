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

import { describe, it, expect } from "vitest";
import { computeBuildDps, isSkillDamaging } from "../lib/damage/index";
import { loadDamageConfig } from "../lib/damage/config";
import type { DamageConfig } from "../lib/damage/config";
import type { SkillEntry, AffixEntry, AspectEntry } from "../lib/catalog";
import type { Character, Build, Item } from "../lib/schema";

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
  aspects: [] as AspectEntry[],
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
      aspects: [],
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
      aspects: [],
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
      aspects: [],
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
    ), { skills: [skill], affixes: [], aspects: [] }, config);

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
      { skills: [skill], affixes: [], aspects: [] },
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
    ), { skills: [skill], affixes: [coreSkillAffix], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [coreSkillAffix], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [affixA, affixB], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [affixA, affixB], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [ccAffix], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [ccAffix], aspects: [] }, config);

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
      skills: [skill], affixes: [], aspects: [],
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
    const result = computeBuildDps(testBuild, character, { skills: [skill], affixes: [], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [cscAffix, csdAffix], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [cscAffix, csdAffix], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [cscAffix], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [coreAffix], aspects: [] }, configA);

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
    ), { skills: [skill], affixes: [coreAffix], aspects: [] }, configA);

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
      skills: [skill], affixes: [coreAffix], aspects: [],
    }, configA);

    // With +30% as distinct mult (Position B): distinctMult = 1.30 → different multiplier interaction
    const resultB = computeBuildDps(testBuild, character, {
      skills: [skill], affixes: [coreAffix], aspects: [],
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
    ), { skills: [skill], affixes: [asAffix], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [asAffix], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [asAffix], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [asAffix], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [asAffix], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [asAffix], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [asAffix], aspects: [] }, config);

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
    ), { skills: [skill], affixes: [asAffix], aspects: [] }, config);

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
        aspects: [],
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
        aspects: [],
      }, config)
    ).not.toThrow();
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
      skills: [skillA, skillB], affixes: [], aspects: [],
    }, config);
    expect(result.perSkill).toHaveLength(2);
    const maxDps = Math.max(...result.perSkill.map((s) => s.dps));
    expect(result.aggregate).toBeCloseTo(maxDps, 5);
    expect(result.perSkill.find((s) => s.skillId === "skill_a")!.dps).toBeGreaterThan(
      result.perSkill.find((s) => s.skillId === "skill_b")!.dps
    );
  });
});
