/**
 * Triage DPS delta computation tests.
 *
 * Tests the data-layer computation that backs DpsDeltaSection:
 * - D37: equipping a new item in a slot and computing the DPS delta
 * - Per-skill delta: changes in individual skill DPS, not just aggregate
 * - Positive delta: better item → DPS increases
 * - Negative delta: worse item → DPS decreases
 * - Zero delta: identical items → no change
 * - Null state: no damaging skills → delta = 0
 * - First-equip: empty slot baseline → positive delta, not +∞
 * - Multi-skill: each skill has its own delta
 * - Swapping weapon updates DPS via itemPower-based formula (D26)
 *
 * Per D32: flat file under __tests__/ (not subdir'd).
 * Environment: node (no JSDOM needed — pure computation tests).
 */

import { describe, it, expect } from "vitest";
import { computeBuildDps } from "../lib/damage/index";
import { baseConfig } from "../lib/damage/client-config";
import type { SkillEntry, AffixEntry, AspectEntry } from "../lib/catalog";
import type { Character, Build, Item, D4Class } from "../lib/schema";

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

function makeWeapon(itemPower: number, slot = "weapon"): Item {
  return {
    slot,
    name: `Test Weapon (${itemPower} IP)`,
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
  skillSelections: Array<{ skillId: string; rank: number }>,
  className: D4Class = "Sorcerer"
): Character {
  return {
    id: "triage-delta-char",
    name: "Triage Test Character",
    class: className,
    level: 100,
    paragonAllocation: { paragonLevel: 200, boards: [] },
    skillSelections,
    equippedItems,
    playstyleConstraints: [],
  };
}

const testBuild: Build = {
  id: "triage-delta-build",
  characterId: "triage-delta-char",
  name: "Triage Delta Test Build",
  notes: "",
  targetItems: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** Helper: compute current and new DPS results for per-skill delta analysis. */
function computePerSkillDelta(
  character: Character,
  catalog: { skills: SkillEntry[]; affixes: AffixEntry[]; aspects: AspectEntry[] },
  newItem: Item,
  slotId: string
): Array<{ skillId: string; diff: number; currentDps: number; newDps: number }> {
  const currentResult = computeBuildDps(testBuild, character, catalog, baseConfig);
  const updatedCharacter: Character = {
    ...character,
    equippedItems: { ...character.equippedItems, [slotId]: newItem },
  };
  const newResult = computeBuildDps(testBuild, updatedCharacter, catalog, baseConfig);

  // Merge by skillId
  const skillMap = new Map<string, { currentDps: number; newDps: number }>();
  for (const s of currentResult.perSkill) {
    skillMap.set(s.skillId, { currentDps: s.dps, newDps: 0 });
  }
  for (const s of newResult.perSkill) {
    const existing = skillMap.get(s.skillId);
    if (existing) {
      existing.newDps = s.dps;
    } else {
      skillMap.set(s.skillId, { currentDps: 0, newDps: s.dps });
    }
  }

  return Array.from(skillMap.entries()).map(([skillId, entry]) => ({
    skillId,
    currentDps: entry.currentDps,
    newDps: entry.newDps,
    diff: entry.newDps - entry.currentDps,
  }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Triage DPS delta — D37 aggregate computation", () => {
  const skill = makeSkill("fireball");
  const catalog = { skills: [skill], affixes: [] as AffixEntry[], aspects: [] as AspectEntry[] };

  it("returns positive aggregate delta when upgrading to a better weapon", () => {
    const character = makeCharacter({ weapon: makeWeapon(600) }, [{ skillId: "fireball", rank: 3 }]);
    const newWeapon = makeWeapon(900);
    const current = computeBuildDps(testBuild, character, catalog, baseConfig).aggregate;
    const updatedCharacter = { ...character, equippedItems: { weapon: newWeapon } };
    const next = computeBuildDps(testBuild, updatedCharacter, catalog, baseConfig).aggregate;
    expect(next - current).toBeGreaterThan(0);
  });

  it("returns negative aggregate delta when downgrading to a weaker weapon", () => {
    const character = makeCharacter({ weapon: makeWeapon(900) }, [{ skillId: "fireball", rank: 3 }]);
    const newWeapon = makeWeapon(600);
    const current = computeBuildDps(testBuild, character, catalog, baseConfig).aggregate;
    const updatedCharacter = { ...character, equippedItems: { weapon: newWeapon } };
    const next = computeBuildDps(testBuild, updatedCharacter, catalog, baseConfig).aggregate;
    expect(next - current).toBeLessThan(0);
  });

  it("returns zero delta when equipping an identical weapon", () => {
    const character = makeCharacter({ weapon: makeWeapon(800) }, [{ skillId: "fireball", rank: 3 }]);
    const identicalWeapon = makeWeapon(800);
    const current = computeBuildDps(testBuild, character, catalog, baseConfig).aggregate;
    const updatedCharacter = { ...character, equippedItems: { weapon: identicalWeapon } };
    const next = computeBuildDps(testBuild, updatedCharacter, catalog, baseConfig).aggregate;
    expect(next - current).toBeCloseTo(0, 6);
  });

  it("returns zero aggregate delta when there are no damaging skills (D28 null state)", () => {
    const noSkillCatalog = { skills: [] as SkillEntry[], affixes: [] as AffixEntry[], aspects: [] as AspectEntry[] };
    const character = makeCharacter({ weapon: makeWeapon(800) }, []);
    const newWeapon = makeWeapon(900);
    const current = computeBuildDps(testBuild, character, noSkillCatalog, baseConfig).aggregate;
    const updatedCharacter = { ...character, equippedItems: { weapon: newWeapon } };
    const next = computeBuildDps(testBuild, updatedCharacter, noSkillCatalog, baseConfig).aggregate;
    expect(next - current).toBe(0);
  });

  it("equipping into an empty slot gives positive delta (first-equip)", () => {
    const character = makeCharacter({}, [{ skillId: "fireball", rank: 3 }]);
    const newWeapon = makeWeapon(800);
    const current = computeBuildDps(testBuild, character, catalog, baseConfig).aggregate;
    const updatedCharacter = { ...character, equippedItems: { weapon: newWeapon } };
    const next = computeBuildDps(testBuild, updatedCharacter, catalog, baseConfig).aggregate;
    expect(next - current).toBeGreaterThan(0);
  });
});

describe("Triage DPS delta — D37 per-skill computation", () => {
  it("per-skill delta is positive for each damaging skill when upgrading weapon", () => {
    const skill1 = makeSkill("fireball", 1.20);
    const skill2 = makeSkill("ice_shards", 0.80);
    const catalog = {
      skills: [skill1, skill2],
      affixes: [] as AffixEntry[],
      aspects: [] as AspectEntry[],
    };
    const character = makeCharacter(
      { weapon: makeWeapon(600) },
      [
        { skillId: "fireball", rank: 3 },
        { skillId: "ice_shards", rank: 3 },
      ]
    );

    const deltas = computePerSkillDelta(character, catalog, makeWeapon(900), "weapon");
    expect(deltas).toHaveLength(2);
    for (const d of deltas) {
      expect(d.diff).toBeGreaterThan(0);
    }
  });

  it("per-skill deltas are proportional to each skill's damage coefficient", () => {
    // skill1 has twice the scaleValue of skill2 → should have exactly 2× the absolute delta
    const skill1 = makeSkill("fireball", 1.20);
    const skill2 = makeSkill("ice_shards", 0.60);
    const catalog = {
      skills: [skill1, skill2],
      affixes: [] as AffixEntry[],
      aspects: [] as AspectEntry[],
    };
    const character = makeCharacter(
      { weapon: makeWeapon(600) },
      [
        { skillId: "fireball", rank: 1 },
        { skillId: "ice_shards", rank: 1 },
      ]
    );

    const deltas = computePerSkillDelta(character, catalog, makeWeapon(900), "weapon");
    const d1 = deltas.find((d) => d.skillId === "fireball")!;
    const d2 = deltas.find((d) => d.skillId === "ice_shards")!;
    expect(d1.diff / d2.diff).toBeCloseTo(2.0, 4);
  });

  it("first-equip: currentDps is 0 and newDps is positive", () => {
    const skill = makeSkill("fireball");
    const catalog = { skills: [skill], affixes: [] as AffixEntry[], aspects: [] as AspectEntry[] };
    const character = makeCharacter({}, [{ skillId: "fireball", rank: 3 }]);

    const deltas = computePerSkillDelta(character, catalog, makeWeapon(800), "weapon");
    expect(deltas).toHaveLength(1);
    expect(deltas[0].currentDps).toBe(0);
    expect(deltas[0].newDps).toBeGreaterThan(0);
    expect(deltas[0].diff).toBeGreaterThan(0);
  });

  it("negative delta is visible when swapping to a worse weapon", () => {
    const skill = makeSkill("fireball");
    const catalog = { skills: [skill], affixes: [] as AffixEntry[], aspects: [] as AspectEntry[] };
    const character = makeCharacter({ weapon: makeWeapon(900) }, [{ skillId: "fireball", rank: 3 }]);

    const deltas = computePerSkillDelta(character, catalog, makeWeapon(600), "weapon");
    expect(deltas).toHaveLength(1);
    expect(deltas[0].diff).toBeLessThan(0);
  });

  it("ordering by |diff| desc puts most-affected skill first", () => {
    const skill1 = makeSkill("fireball", 1.50); // larger coeff → larger diff
    const skill2 = makeSkill("ice_shards", 0.50);
    const catalog = {
      skills: [skill1, skill2],
      affixes: [] as AffixEntry[],
      aspects: [] as AspectEntry[],
    };
    const character = makeCharacter(
      { weapon: makeWeapon(600) },
      [
        { skillId: "fireball", rank: 1 },
        { skillId: "ice_shards", rank: 1 },
      ]
    );

    const deltas = computePerSkillDelta(character, catalog, makeWeapon(900), "weapon");
    // Sort as the UI would (|diff| desc)
    const sorted = [...deltas].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    expect(sorted[0].skillId).toBe("fireball");
    expect(sorted[1].skillId).toBe("ice_shards");
  });

  it("delta is proportional to weapon damage increase (linear formula, D26)", () => {
    // weaponDamage = 100 + 1.5 × itemPower
    // 600 IP → 1000; 900 IP → 1450; ratio = 1.45
    const skill = makeSkill("fireball");
    const catalog = { skills: [skill], affixes: [] as AffixEntry[], aspects: [] as AspectEntry[] };
    const character = makeCharacter({ weapon: makeWeapon(600) }, [{ skillId: "fireball", rank: 3 }]);
    const current = computeBuildDps(testBuild, character, catalog, baseConfig);
    const deltas = computePerSkillDelta(character, catalog, makeWeapon(900), "weapon");
    const d = deltas[0];
    expect(d.newDps / d.currentDps).toBeCloseTo(1450 / 1000, 4);
    expect(d.newDps / current.aggregate).toBeCloseTo(1450 / 1000, 4);
  });

  it("swapping off-hand for Barbarian weapon2 slot yields no delta (primary slot unchanged)", () => {
    const barbSkill: SkillEntry = {
      id: "bash",
      label: "Bash",
      category: "basic",
      maxRank: 5,
      scalingAttributes: [
        { attribute: "Attr_Skill_Damage_Percent", scaleValue: 0.50, rankScale: 0.05 },
      ],
    };
    const barbCatalog = { skills: [barbSkill], affixes: [] as AffixEntry[], aspects: [] as AspectEntry[] };
    const barbCharacter = makeCharacter(
      { weapon: makeWeapon(800, "weapon") },
      [{ skillId: "bash", rank: 3 }],
      "Barbarian"
    );

    // Equipping to weapon2 (not primary for Barbarian per config) should not change DPS
    const current = computeBuildDps(testBuild, barbCharacter, barbCatalog, baseConfig).aggregate;
    const updatedBarb = {
      ...barbCharacter,
      equippedItems: { ...barbCharacter.equippedItems, weapon2: makeWeapon(700, "weapon2") },
    };
    const next = computeBuildDps(testBuild, updatedBarb, barbCatalog, baseConfig).aggregate;
    expect(next).toBeCloseTo(current, 4);
  });
});
