/**
 * Build summary render logic tests.
 *
 * Tests the data-layer computation that backs BuildSummaryView:
 * - computeBuildDps with baseConfig produces aggregate + perSkill
 * - D36: aggregate formats as integer with thousands separator
 * - D35: perSkill is non-empty when damaging skills are selected
 * - D28: null / zero state when no weapon is equipped
 * - Reactive: changing equippedItems changes dpsResult
 *
 * Per D32: flat file under __tests__/ (not subdir'd).
 * Environment: node (no JSDOM needed — pure computation tests).
 */

import { describe, it, expect } from "vitest";
import { computeBuildDps } from "../lib/damage/index";
import { baseConfig } from "../lib/damage/client-config";
import { formatDps } from "../components/d4/SkillDpsSection";
import type { SkillEntry, AffixEntry, AspectEntry } from "../lib/catalog";
import type { Character, Build, Item } from "../lib/schema";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSkill(id: string, scaleValue = 0.80): SkillEntry {
  return {
    id,
    label: id,
    category: "core",
    maxRank: 5,
    scalingAttributes: [
      { attribute: "Attr_Skill_Damage_Percent", scaleValue, rankScale: 0.08 },
    ],
  };
}

function makeWeapon(itemPower: number): Item {
  return {
    slot: "weapon",
    name: "Test Weapon",
    rarity: "rare",
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

function makeCharacter(
  equippedItems: Record<string, Item>,
  skillSelections: Array<{ skillId: string; rank: number }> = []
): Character {
  return {
    id: "build-summary-char",
    name: "Test Character",
    class: "Sorcerer",
    level: 100,
    paragonAllocation: { paragonLevel: 200, boards: [] },
    skillSelections,
    equippedItems,
    playstyleConstraints: [],
  };
}

const testBuild: Build = {
  id: "build-summary-build",
  characterId: "build-summary-char",
  name: "Summary Test Build",
  notes: "",
  targetItems: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const EMPTY_CATALOG = {
  skills: [] as SkillEntry[],
  affixes: [] as AffixEntry[],
  aspects: [] as AspectEntry[],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("BuildSummaryView data layer — computeBuildDps with baseConfig", () => {
  it("returns zero aggregate with no selected skills", () => {
    const character = makeCharacter({ weapon: makeWeapon(800) });
    const result = computeBuildDps(testBuild, character, EMPTY_CATALOG, baseConfig);
    expect(result.aggregate).toBe(0);
    expect(result.perSkill).toHaveLength(0);
  });

  it("returns zero aggregate when no weapon is equipped (D28 null state)", () => {
    const skill = makeSkill("fireball");
    const character = makeCharacter(
      {}, // no weapon
      [{ skillId: "fireball", rank: 3 }]
    );
    const catalog = { skills: [skill], affixes: [], aspects: [] };
    const result = computeBuildDps(testBuild, character, catalog, baseConfig);
    // Engine returns the skill result but with dps=0 (no weapon)
    expect(result.aggregate).toBe(0);
    // perSkill still contains the skill entry (D28: report skill, zero DPS)
    expect(result.perSkill[0].skillId).toBe("fireball");
    expect(result.perSkill[0].dps).toBe(0);
  });

  it("returns non-zero aggregate with a weapon + selected damaging skill", () => {
    const skill = makeSkill("fireball");
    const character = makeCharacter(
      { weapon: makeWeapon(800) },
      [{ skillId: "fireball", rank: 3 }]
    );
    const catalog = { skills: [skill], affixes: [], aspects: [] };
    const result = computeBuildDps(testBuild, character, catalog, baseConfig);
    expect(result.aggregate).toBeGreaterThan(0);
    expect(result.perSkill).toHaveLength(1);
    expect(result.perSkill[0].skillId).toBe("fireball");
  });

  it("aggregate equals max per-skill DPS when multiple skills are selected", () => {
    const skill1 = makeSkill("fireball", 0.80);
    const skill2 = makeSkill("icebolt", 0.40); // weaker
    const character = makeCharacter(
      { weapon: makeWeapon(800) },
      [
        { skillId: "fireball", rank: 5 },
        { skillId: "icebolt", rank: 5 },
      ]
    );
    const catalog = { skills: [skill1, skill2], affixes: [], aspects: [] };
    const result = computeBuildDps(testBuild, character, catalog, baseConfig);
    expect(result.perSkill).toHaveLength(2);
    // Aggregate = max(per-skill DPS) per D18
    const max = Math.max(...result.perSkill.map((s) => s.dps));
    expect(result.aggregate).toBeCloseTo(max, 6);
  });

  it("equipping a better weapon increases the aggregate DPS (reactivity)", () => {
    const skill = makeSkill("fireball");
    const catalog = { skills: [skill], affixes: [], aspects: [] };

    const weakChar = makeCharacter(
      { weapon: makeWeapon(400) },
      [{ skillId: "fireball", rank: 3 }]
    );
    const strongChar = makeCharacter(
      { weapon: makeWeapon(800) },
      [{ skillId: "fireball", rank: 3 }]
    );

    const weakResult = computeBuildDps(testBuild, weakChar, catalog, baseConfig);
    const strongResult = computeBuildDps(testBuild, strongChar, catalog, baseConfig);

    expect(strongResult.aggregate).toBeGreaterThan(weakResult.aggregate);
    // Linear model: weaponDamage = 100 + 1.5 × itemPower; 800 IP → 1300, 400 IP → 700
    expect(strongResult.aggregate / weakResult.aggregate).toBeCloseTo(1300 / 700, 2);
  });

  it("skill rank increases DPS proportionally to rankScale", () => {
    const skill = makeSkill("fireball");
    const catalog = { skills: [skill], affixes: [], aspects: [] };

    const rank1Char = makeCharacter(
      { weapon: makeWeapon(800) },
      [{ skillId: "fireball", rank: 1 }]
    );
    const rank5Char = makeCharacter(
      { weapon: makeWeapon(800) },
      [{ skillId: "fireball", rank: 5 }]
    );

    const r1 = computeBuildDps(testBuild, rank1Char, catalog, baseConfig);
    const r5 = computeBuildDps(testBuild, rank5Char, catalog, baseConfig);

    // coeff at r1 = 0.80 + 0.08×0 = 0.80; at r5 = 0.80 + 0.08×4 = 1.12
    expect(r5.aggregate / r1.aggregate).toBeCloseTo(1.12 / 0.80, 4);
  });
});

describe("formatDps utility (D36)", () => {
  it("formats small integers without separator", () => {
    expect(formatDps(999)).toBe("999");
  });

  it("formats large integers with thousands separator", () => {
    expect(formatDps(1234567)).toBe("1,234,567");
  });

  it("rounds fractional DPS to nearest integer", () => {
    expect(formatDps(1234.6)).toBe("1,235");
    expect(formatDps(1234.4)).toBe("1,234");
  });

  it("formats zero as '0'", () => {
    expect(formatDps(0)).toBe("0");
  });
});
