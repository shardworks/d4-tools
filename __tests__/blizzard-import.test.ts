/**
 * Unit tests for the Blizzard → canonical conversion (D11-D16).
 *
 * Uses fixture hero + hero-items payloads to verify the conversion
 * produces schema-valid Character drafts and correct warnings.
 */

import { describe, it, expect } from "vitest";
import { convertBnetHero } from "../lib/blizzard/import";
import { buildResolvers } from "../lib/blizzard/resolvers";
import { CharacterSchema } from "../lib/schema/character";
import type { BnetHero, BnetHeroItems } from "../lib/blizzard/types";
import type { AffixEntry, ClassEntry, SlotEntry } from "../lib/catalog";

// ─── Fixtures ─────────────────────────────────────────────────────────────

const mockClasses: ClassEntry[] = [
  { id: "Sorcerer", label: "Sorcerer", primaryStat: "Intelligence", supported: true, bnetClassName: "sorcerer", bnetClassId: 1 },
  { id: "Barbarian", label: "Barbarian", primaryStat: "Strength", supported: true, bnetClassName: "barbarian", bnetClassId: 4 },
  { id: "Paladin", label: "Paladin", primaryStat: "Strength", supported: false, bnetClassName: "crusader", bnetClassId: 7 },
];

const mockSlots: SlotEntry[] = [
  { id: "helm", label: "Helm", cluster: "armor", bnetSlotKey: "head" },
  { id: "chest", label: "Chest", cluster: "armor", bnetSlotKey: "torso" },
];

const mockAffixes: AffixEntry[] = [
  {
    id: "affix_max_life",
    label: "Maximum Life",
    labelTemplate: "+{value} Maximum Life",
    valueRange: [700, 2800],
    isPercent: false,
    slotRestrictions: [],
    classRestrictions: [],
    bnetId: 334512,
  },
];

const resolvers = buildResolvers({
  affixes: mockAffixes,
  aspects: [],
  skills: [],
  boards: [],
  glyphs: [],
  classes: mockClasses,
  slots: mockSlots,
});

const baseHero: BnetHero = {
  id: 12345678,
  name: "Blizzard Sorc",
  class: "sorcerer",
  level: 100,
  paragonLevel: 300,
  hardcore: false,
  seasonal: true,
  dead: false,
  seasonCreatedIn: 13,
};

const baseItems: BnetHeroItems = {};

// ─── Conversion output tests ──────────────────────────────────────────────

describe("convertBnetHero — basic character fields", () => {
  it("produces a character with the correct name and class", () => {
    const { character } = convertBnetHero(baseHero, baseItems, "americas", resolvers, "13");
    expect(character.name).toBe("Blizzard Sorc");
    expect(character.class).toBe("Sorcerer");
  });

  it("clamps level to [1, 100]", () => {
    const { character } = convertBnetHero({ ...baseHero, level: 150 }, baseItems, "americas", resolvers, "13");
    expect(character.level).toBe(100);
  });

  it("clamps paragonLevel to [0, 300] — upper bound", () => {
    const { character } = convertBnetHero({ ...baseHero, paragonLevel: 999 }, baseItems, "americas", resolvers, "13");
    expect(character.paragonAllocation.paragonLevel).toBe(300);
  });

  it("clamps paragonLevel to [0, 300] — lower bound (defence-in-depth against negative values)", () => {
    const { character } = convertBnetHero({ ...baseHero, paragonLevel: -5 }, baseItems, "americas", resolvers, "13");
    expect(character.paragonAllocation.paragonLevel).toBe(0);
  });

  it("populates the import provenance block (D12)", () => {
    const { character } = convertBnetHero(baseHero, baseItems, "americas", resolvers, "13");
    expect(character.import).toBeDefined();
    expect(character.import!.source).toBe("battlenet");
    expect(character.import!.heroId).toBe(12345678);
    expect(character.import!.realm).toBe("seasonal");
    expect(character.import!.region).toBe("americas");
    expect(character.import!.season).toBe("13");
  });

  it("sets season to null for eternal characters (D30)", () => {
    const { character } = convertBnetHero(
      { ...baseHero, seasonal: false },
      baseItems,
      "europe",
      resolvers,
      null
    );
    expect(character.import!.season).toBeNull();
    expect(character.import!.realm).toBe("eternal");
  });

  it("buildName equals character name (D16)", () => {
    const { buildName } = convertBnetHero(baseHero, baseItems, "americas", resolvers, "13");
    expect(buildName).toBe("Blizzard Sorc");
  });
});

describe("convertBnetHero — schema validation (D29)", () => {
  it("output passes CharacterSchema.omit({ id: true }).parse", () => {
    const { character } = convertBnetHero(baseHero, baseItems, "americas", resolvers, "13");
    expect(() => CharacterSchema.omit({ id: true }).parse(character)).not.toThrow();
  });
});

describe("convertBnetHero — item conversion", () => {
  const heroWithHelm: BnetHeroItems = {
    head: {
      id: 111,
      name: "Harlequin Crest",
      quality: "unique",
      power: 925,
      isAncestral: true,
      explicits: [{ id: 334512, value: 2800 }],
    },
  };

  it("maps Blizzard slot key 'head' to catalog slot 'helm'", () => {
    const { character } = convertBnetHero(baseHero, heroWithHelm, "americas", resolvers, "13");
    expect(character.equippedItems).toHaveProperty("helm");
  });

  it("preserves item name and rarity", () => {
    const { character } = convertBnetHero(baseHero, heroWithHelm, "americas", resolvers, "13");
    const helm = character.equippedItems["helm"]!;
    expect(helm.name).toBe("Harlequin Crest");
    expect(helm.rarity).toBe("unique");
    expect(helm.isAncestral).toBe(true);
    expect(helm.itemPower).toBe(925);
  });

  it("resolves known affix bnetId to catalog id", () => {
    const { character, warnings } = convertBnetHero(baseHero, heroWithHelm, "americas", resolvers, "13");
    const helm = character.equippedItems["helm"]!;
    expect(helm.explicits).toHaveLength(1);
    expect(helm.explicits[0].affixId).toBe("affix_max_life");
    expect(helm.explicits[0].rolledValue).toBe(2800);
    // No warning for this resolved affix
    const affixWarnings = warnings.filter((w) => w.rawId === 334512);
    expect(affixWarnings).toHaveLength(0);
  });
});

describe("convertBnetHero — unresolved IDs (D14)", () => {
  const heroWithUnknownAffix: BnetHeroItems = {
    head: {
      id: 111,
      name: "Mystery Helm",
      quality: "legendary",
      power: 850,
      explicits: [{ id: 999999, value: 100 }],
    },
  };

  it("stores unresolved affix with 'unresolved:' prefix", () => {
    const { character } = convertBnetHero(baseHero, heroWithUnknownAffix, "americas", resolvers, "13");
    const helm = character.equippedItems["helm"]!;
    expect(helm.explicits[0].affixId).toBe("unresolved:999999");
  });

  it("accumulates a warning for unresolved affix", () => {
    const { warnings } = convertBnetHero(baseHero, heroWithUnknownAffix, "americas", resolvers, "13");
    const w = warnings.find((x) => x.rawId === 999999);
    expect(w).toBeDefined();
    expect(w!.type).toBe("affix");
    expect(w!.storedAs).toBe("unresolved:999999");
  });

  it("accumulates a warning for unknown slot key", () => {
    const items: BnetHeroItems = {
      unknown_slot: { id: 222, name: "Mystery Item", quality: "rare", power: 800 },
    };
    const { warnings } = convertBnetHero(baseHero, items, "americas", resolvers, "13");
    const slotWarning = warnings.find((w) => w.type === "slot");
    expect(slotWarning).toBeDefined();
  });
});

/**
 * D15 resolver-fallback tests: these use a deliberately minimal mock that carries
 * no skill catalog entries for Paladin (skills: [] in resolvers above). The purpose
 * is to verify resolver fallback behaviour (unresolved:NNN warnings) under arbitrary
 * inputs — not to reflect the production catalog's content. The production Paladin
 * and Warlock skill catalogs are populated and tested in __tests__/catalog.test.ts.
 */
describe("convertBnetHero — Paladin/Warlock class handling (D15)", () => {
  it("resolves 'crusader' bnetClassName to the Paladin catalog class (no class warning)", () => {
    const paladinHero: BnetHero = {
      ...baseHero,
      class: "crusader",
      name: "Holy Paladin",
    };
    const { character, warnings } = convertBnetHero(paladinHero, baseItems, "americas", resolvers, "13");
    // Class resolves to Paladin (it's in our mock class list via bnetClassName: "crusader")
    expect(character.class).toBe("Paladin");
    // No class warning — the class was successfully resolved
    expect(warnings.filter((w) => w.type === "class")).toHaveLength(0);
  });

  it("accumulates unresolved-skill warnings for Paladin when skills are present (D15 skills path)", () => {
    const paladinWithSkills: BnetHero = {
      ...baseHero,
      class: "crusader",
      name: "Holy Paladin",
      skills: {
        active: [{ id: 99901, name: "Smite" }],
        passive: [{ id: 99902, name: "Faith" }],
      },
    };
    const { character, warnings } = convertBnetHero(paladinWithSkills, baseItems, "americas", resolvers, "13");
    expect(character.class).toBe("Paladin");
    // Skills can't be resolved (empty skill catalog for Paladin in mock) — each generates a warning
    const skillWarnings = warnings.filter((w) => w.type === "skill");
    expect(skillWarnings).toHaveLength(2);
    expect(skillWarnings[0].storedAs).toBe("unresolved:99901");
    expect(skillWarnings[1].storedAs).toBe("unresolved:99902");
  });

  it("accumulates class warning for truly unknown class", () => {
    const unknownHero: BnetHero = { ...baseHero, class: "wizard" };
    const { character, warnings } = convertBnetHero(unknownHero, baseItems, "americas", resolvers, "13");
    // Falls back to Sorcerer (default) since wizard is not in catalog
    expect(character.class).toBe("Sorcerer");
    const classWarning = warnings.find((w) => w.type === "class");
    expect(classWarning).toBeDefined();
  });
});
