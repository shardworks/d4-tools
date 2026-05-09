/**
 * Triage DPS delta computation tests.
 *
 * Tests the data-layer computation that backs DpsDeltaSection:
 * - D37: equipping a new item in a slot and computing the DPS delta
 * - Positive delta: better item → DPS increases
 * - Negative delta: worse item → DPS decreases
 * - Zero delta: identical items → no change
 * - Null state: no damaging skills → delta = 0
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

function makeSkill(id: string): SkillEntry {
  return {
    id,
    label: id,
    category: "core",
    maxRank: 5,
    scalingAttributes: [
      { attribute: "Attr_Skill_Damage_Percent", scaleValue: 0.80, rankScale: 0.08 },
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
  className: D4Class = "Sorcerer"
): Character {
  return {
    id: "triage-delta-char",
    name: "Triage Test Character",
    class: className,
    level: 100,
    paragonAllocation: { paragonLevel: 200, boards: [] },
    skillSelections: [{ skillId: "fireball", rank: 3 }],
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

/** Helper: compute current DPS, simulate equipping newItem in slotId, return delta. */
function computeDelta(
  character: Character,
  catalog: { skills: SkillEntry[]; affixes: AffixEntry[]; aspects: AspectEntry[] },
  newItem: Item,
  slotId: string
): number {
  const currentDps = computeBuildDps(testBuild, character, catalog, baseConfig).aggregate;
  const updatedCharacter: Character = {
    ...character,
    equippedItems: { ...character.equippedItems, [slotId]: newItem },
  };
  const newDps = computeBuildDps(testBuild, updatedCharacter, catalog, baseConfig).aggregate;
  return newDps - currentDps;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Triage DPS delta — D37 computation", () => {
  const skill = makeSkill("fireball");
  const catalog = { skills: [skill], affixes: [] as AffixEntry[], aspects: [] as AspectEntry[] };

  it("returns positive delta when upgrading to a better weapon", () => {
    const character = makeCharacter({ weapon: makeWeapon(600) });
    const newWeapon = makeWeapon(900);
    const delta = computeDelta(character, catalog, newWeapon, "weapon");
    expect(delta).toBeGreaterThan(0);
  });

  it("returns negative delta when downgrading to a weaker weapon", () => {
    const character = makeCharacter({ weapon: makeWeapon(900) });
    const newWeapon = makeWeapon(600);
    const delta = computeDelta(character, catalog, newWeapon, "weapon");
    expect(delta).toBeLessThan(0);
  });

  it("returns zero delta when equipping an identical weapon", () => {
    const character = makeCharacter({ weapon: makeWeapon(800) });
    const identicalWeapon = makeWeapon(800);
    const delta = computeDelta(character, catalog, identicalWeapon, "weapon");
    expect(delta).toBeCloseTo(0, 6);
  });

  it("returns zero delta when there are no damaging skills (D28 null state)", () => {
    const noSkillCatalog = { skills: [] as SkillEntry[], affixes: [] as AffixEntry[], aspects: [] as AspectEntry[] };
    // Character has no skill selections matching catalog
    const character: Character = {
      ...makeCharacter({ weapon: makeWeapon(800) }),
      skillSelections: [],
    };
    const newWeapon = makeWeapon(900);
    const delta = computeDelta(character, noSkillCatalog, newWeapon, "weapon");
    expect(delta).toBe(0);
  });

  it("delta is proportional to weapon damage increase (linear formula, D26)", () => {
    // weaponDamage = 100 + 1.5 × itemPower
    // 600 IP → 1000; 900 IP → 1450; ratio 1450/1000 = 1.45
    const character = makeCharacter({ weapon: makeWeapon(600) });
    const newWeapon = makeWeapon(900);
    const currentDps = computeBuildDps(testBuild, character, catalog, baseConfig).aggregate;
    const delta = computeDelta(character, catalog, newWeapon, "weapon");
    const newDps = currentDps + delta;
    expect(newDps / currentDps).toBeCloseTo(1450 / 1000, 4);
  });

  it("equipping into an empty slot gives positive delta (no equipped item baseline)", () => {
    // Character has no weapon — current DPS = 0 (skill result with dps=0)
    const character = makeCharacter({}); // no weapon equipped
    const newWeapon = makeWeapon(800);
    const delta = computeDelta(character, catalog, newWeapon, "weapon");
    expect(delta).toBeGreaterThan(0);
  });

  it("swapping off-hand for Barbarian yields correct delta on weapon2 slot", () => {
    const barbCharacter: Character = {
      ...makeCharacter({ weapon: makeWeapon(800, "weapon") }, "Barbarian"),
      // Barbarian uses weapon/weapon2/offHand/offHand2 slots
    };
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
    const barbBuild: Build = { ...testBuild, characterId: barbCharacter.id };
    const barbWithSkill: Character = {
      ...barbCharacter,
      skillSelections: [{ skillId: "bash", rank: 3 }],
    };

    const currentDps = computeBuildDps(barbBuild, barbWithSkill, barbCatalog, baseConfig).aggregate;

    // Equip a weapon in the weapon2 slot (Barbarian's second main-hand)
    const updatedBarb: Character = {
      ...barbWithSkill,
      equippedItems: { ...barbWithSkill.equippedItems, weapon2: makeWeapon(700, "weapon2") },
    };
    const newDps = computeBuildDps(barbBuild, updatedBarb, barbCatalog, baseConfig).aggregate;

    // weapon2 is not a primary weapon slot for Barbarian (weapon is), so DPS unchanged
    // (primary slot remains weapon)
    expect(newDps).toBeCloseTo(currentDps, 4);
  });
});
