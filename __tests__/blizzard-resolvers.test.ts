/**
 * Unit tests for the resolver primitive (D10) and per-entity resolvers.
 *
 * Tests cover: numeric ID lookup, string fileName lookup, unresolved miss,
 * class resolution, and slot resolution.
 */

import { describe, it, expect } from "vitest";
import { makeResolver, buildResolvers } from "../lib/blizzard/resolvers";
import type { AffixEntry, ClassEntry, SlotEntry } from "../lib/catalog";

// ─── makeResolver unit tests ───────────────────────────────────────────────

describe("makeResolver — numeric bnetId lookup", () => {
  const catalog: AffixEntry[] = [
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
    {
      id: "affix_str",
      label: "Strength",
      labelTemplate: "+{value} Strength",
      valueRange: [60, 200],
      isPercent: false,
      slotRestrictions: [],
      classRestrictions: [],
      bnetId: 220481,
    },
  ];

  const resolve = makeResolver(catalog);

  it("resolves a known numeric bnetId", () => {
    const result = resolve(334512);
    expect(result.isUnresolved).toBe(false);
    if (!result.isUnresolved) {
      expect(result.entry.id).toBe("affix_max_life");
    }
  });

  it("resolves a second known numeric bnetId", () => {
    const result = resolve(220481);
    expect(result.isUnresolved).toBe(false);
    if (!result.isUnresolved) {
      expect(result.entry.id).toBe("affix_str");
    }
  });

  it("returns unresolved miss for unknown numeric id", () => {
    const result = resolve(999999);
    expect(result.isUnresolved).toBe(true);
    if (result.isUnresolved) {
      expect(result.unresolvedKey).toBe("unresolved:999999");
    }
  });

  it("resolves a numeric id passed as a string", () => {
    const result = resolve("334512");
    expect(result.isUnresolved).toBe(false);
    if (!result.isUnresolved) {
      expect(result.entry.id).toBe("affix_max_life");
    }
  });
});

describe("makeResolver — bnetFileName lookup", () => {
  const catalog: AffixEntry[] = [
    {
      id: "affix_max_life",
      label: "Maximum Life",
      labelTemplate: "+{value} Maximum Life",
      valueRange: [700, 2800],
      isPercent: false,
      slotRestrictions: [],
      classRestrictions: [],
      bnetFileName: "Affix_MaximumLife",
    },
  ];

  const resolve = makeResolver(catalog);

  it("resolves a known bnetFileName string", () => {
    const result = resolve("Affix_MaximumLife");
    expect(result.isUnresolved).toBe(false);
    if (!result.isUnresolved) {
      expect(result.entry.id).toBe("affix_max_life");
    }
  });

  it("returns miss for unknown string fileName", () => {
    const result = resolve("Affix_Unknown");
    expect(result.isUnresolved).toBe(true);
    if (result.isUnresolved) {
      expect(result.unresolvedKey).toBe("unresolved:Affix_Unknown");
    }
  });
});

describe("makeResolver — entries without bnetId/bnetFileName", () => {
  const catalog: AffixEntry[] = [
    {
      id: "affix_no_bnet",
      label: "No BNet ID",
      labelTemplate: "{value}",
      valueRange: [0, 100],
      isPercent: false,
      slotRestrictions: [],
      classRestrictions: [],
      // No bnetId or bnetFileName
    },
  ];

  const resolve = makeResolver(catalog);

  it("returns miss for any id when catalog entries have no bnet fields", () => {
    const result = resolve(99999);
    expect(result.isUnresolved).toBe(true);
  });
});

// ─── buildResolvers integration tests ─────────────────────────────────────

describe("buildResolvers — class resolver", () => {
  const classes: ClassEntry[] = [
    { id: "Sorcerer", label: "Sorcerer", primaryStat: "Intelligence", supported: true, bnetClassName: "sorcerer", bnetClassId: 1 },
    { id: "Barbarian", label: "Barbarian", primaryStat: "Strength", supported: true, bnetClassName: "barbarian", bnetClassId: 4 },
    { id: "Paladin", label: "Paladin", primaryStat: "Strength", supported: false, bnetClassName: "crusader", bnetClassId: 7 },
  ];

  const resolvers = buildResolvers({
    affixes: [],
    aspects: [],
    skills: [],
    boards: [],
    glyphs: [],
    classes,
    slots: [],
  });

  it("resolves class by bnetClassName string (lowercase)", () => {
    const result = resolvers.class("sorcerer");
    expect(result.isUnresolved).toBe(false);
    if (!result.isUnresolved) expect(result.entry.id).toBe("Sorcerer");
  });

  it("resolves class by bnetClassId", () => {
    const result = resolvers.class(4);
    expect(result.isUnresolved).toBe(false);
    if (!result.isUnresolved) expect(result.entry.id).toBe("Barbarian");
  });

  it("resolves Paladin (unsupported class still resolves — D15)", () => {
    const result = resolvers.class("crusader");
    expect(result.isUnresolved).toBe(false);
    if (!result.isUnresolved) expect(result.entry.id).toBe("Paladin");
  });

  it("returns miss for unknown class", () => {
    const result = resolvers.class("wizard");
    expect(result.isUnresolved).toBe(true);
    if (result.isUnresolved) expect(result.unresolvedKey).toBe("unresolved:wizard");
  });
});

describe("buildResolvers — slot resolver", () => {
  const slots: SlotEntry[] = [
    { id: "helm", label: "Helm", cluster: "armor", bnetSlotKey: "head" },
    { id: "chest", label: "Chest Armor", cluster: "armor", bnetSlotKey: "torso" },
    { id: "amulet", label: "Amulet", cluster: "jewelry", bnetSlotKey: "neck" },
  ];

  const resolvers = buildResolvers({
    affixes: [],
    aspects: [],
    skills: [],
    boards: [],
    glyphs: [],
    classes: [],
    slots,
  });

  it("resolves Blizzard slot key to catalog slot", () => {
    const slot = resolvers.slot("head");
    expect(slot).not.toBeNull();
    expect(slot!.id).toBe("helm");
  });

  it("resolves torso → chest", () => {
    const slot = resolvers.slot("torso");
    expect(slot!.id).toBe("chest");
  });

  it("returns null for unknown slot key", () => {
    const slot = resolvers.slot("unknown_slot");
    expect(slot).toBeNull();
  });
});

describe("buildResolvers — unresolved key format (D14)", () => {
  const resolvers = buildResolvers({
    affixes: [],
    aspects: [],
    skills: [],
    boards: [],
    glyphs: [],
    classes: [],
    slots: [],
  });

  it("unresolved affix key is prefixed with 'unresolved:'", () => {
    const result = resolvers.affix(12345);
    expect(result.isUnresolved).toBe(true);
    if (result.isUnresolved) {
      expect(result.unresolvedKey).toBe("unresolved:12345");
    }
  });

  it("unresolved aspect key uses same prefix", () => {
    const result = resolvers.aspect("AspectFileName");
    expect(result.isUnresolved).toBe(true);
    if (result.isUnresolved) {
      expect(result.unresolvedKey).toBe("unresolved:AspectFileName");
    }
  });
});
