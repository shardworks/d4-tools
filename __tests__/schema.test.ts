import { describe, it, expect } from "vitest";
import {
  CharacterSchema,
  BuildSchema,
  ItemSchema,
  AffixInstanceSchema,
  AspectInstanceSchema,
  ParagonAllocationSchema,
  SkillSelectionSchema,
  PlaystyleConstraintSchema,
} from "../lib/schema";

describe("AffixInstanceSchema", () => {
  it("accepts valid affix instance", () => {
    const result = AffixInstanceSchema.safeParse({ affixId: "affix_max_life", rolledValue: 2000 });
    expect(result.success).toBe(true);
  });

  it("rejects missing affixId", () => {
    const result = AffixInstanceSchema.safeParse({ rolledValue: 100 });
    expect(result.success).toBe(false);
  });

  it("rejects empty affixId", () => {
    const result = AffixInstanceSchema.safeParse({ affixId: "", rolledValue: 100 });
    expect(result.success).toBe(false);
  });
});

describe("AspectInstanceSchema", () => {
  it("accepts codex source", () => {
    const result = AspectInstanceSchema.safeParse({
      aspectId: "conceited_aspect",
      rolledValue: 20,
      source: "codex",
    });
    expect(result.success).toBe(true);
  });

  it("accepts legendary source", () => {
    const result = AspectInstanceSchema.safeParse({
      aspectId: "conceited_aspect",
      rolledValue: 22,
      source: "legendary",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid source", () => {
    const result = AspectInstanceSchema.safeParse({
      aspectId: "some_aspect",
      rolledValue: 10,
      source: "dropped",
    });
    expect(result.success).toBe(false);
  });
});

describe("ItemSchema", () => {
  const validItem = {
    slot: "helm",
    name: "Harlequin Crest",
    rarity: "unique" as const,
    itemPower: 925,
    isAncestral: false,
    implicits: [],
    explicits: [{ affixId: "affix_max_life", rolledValue: 2800 }],
    tempered: [],
    masterworkRank: 0,
    runes: [],
    sockets: [],
  };

  it("accepts valid item", () => {
    const result = ItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it("accepts item with aspect", () => {
    const result = ItemSchema.safeParse({
      ...validItem,
      aspect: { aspectId: "aspect_of_might", rolledValue: 30, source: "codex" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid rarity", () => {
    const result = ItemSchema.safeParse({ ...validItem, rarity: "divine" });
    expect(result.success).toBe(false);
  });

  it("rejects negative item power", () => {
    const result = ItemSchema.safeParse({ ...validItem, itemPower: -1 });
    expect(result.success).toBe(false);
  });

  it("does NOT store isGreater flag (D8)", () => {
    const result = ItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
    if (result.success) {
      // isGreater must not be a key in the parsed data
      expect("isGreater" in result.data).toBe(false);
    }
  });

  it("does NOT have schemaVersion field (D4)", () => {
    const result = ItemSchema.safeParse(validItem);
    if (result.success) {
      expect("schemaVersion" in result.data).toBe(false);
    }
  });
});

describe("CharacterSchema", () => {
  const validCharacter = {
    id: "doomed-aura-sorcerer",
    name: "Doomed Aura Sorcerer",
    class: "Sorcerer" as const,
    level: 100,
    paragonAllocation: {
      paragonLevel: 200,
      boards: [],
    },
    skillSelections: [],
    equippedItems: {},
    playstyleConstraints: [],
  };

  it("accepts valid character", () => {
    const result = CharacterSchema.safeParse(validCharacter);
    expect(result.success).toBe(true);
  });

  it("accepts all six supported classes", () => {
    const classes = ["Barbarian", "Druid", "Necromancer", "Rogue", "Sorcerer", "Spiritborn"] as const;
    for (const cls of classes) {
      const result = CharacterSchema.safeParse({ ...validCharacter, class: cls });
      expect(result.success).toBe(true);
    }
  });

  it("accepts Paladin and Warlock", () => {
    // The schema accepts all 8 classes; catalog and UI behaviour driven by classes.json supported flag
    for (const cls of ["Paladin", "Warlock"] as const) {
      const result = CharacterSchema.safeParse({ ...validCharacter, class: cls });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown class", () => {
    const result = CharacterSchema.safeParse({ ...validCharacter, class: "Wizard" });
    expect(result.success).toBe(false);
  });

  it("rejects unsafe id", () => {
    const result = CharacterSchema.safeParse({ ...validCharacter, id: "../etc/passwd" });
    expect(result.success).toBe(false);
  });

  it("rejects level out of range", () => {
    expect(CharacterSchema.safeParse({ ...validCharacter, level: 0 }).success).toBe(false);
    expect(CharacterSchema.safeParse({ ...validCharacter, level: 101 }).success).toBe(false);
  });

  it("does NOT have schemaVersion field (D4)", () => {
    const result = CharacterSchema.safeParse(validCharacter);
    if (result.success) {
      expect("schemaVersion" in result.data).toBe(false);
    }
  });
});

describe("BuildSchema", () => {
  const validBuild = {
    id: "blizzard-ice-shards",
    characterId: "doomed-aura-sorcerer",
    name: "Blizzard / Ice Shards",
    notes: "",
    targetItems: {},
  };

  it("accepts valid build", () => {
    const result = BuildSchema.safeParse(validBuild);
    expect(result.success).toBe(true);
  });

  it("rejects unsafe build id", () => {
    const result = BuildSchema.safeParse({ ...validBuild, id: "../../evil" });
    expect(result.success).toBe(false);
  });

  it("rejects unsafe characterId", () => {
    const result = BuildSchema.safeParse({ ...validBuild, characterId: "../bad" });
    expect(result.success).toBe(false);
  });
});

describe("ParagonAllocationSchema", () => {
  it("accepts empty allocation", () => {
    const result = ParagonAllocationSchema.safeParse({ paragonLevel: 0, boards: [] });
    expect(result.success).toBe(true);
  });

  it("accepts board with glyph", () => {
    const result = ParagonAllocationSchema.safeParse({
      paragonLevel: 100,
      boards: [
        {
          boardId: "sorc_starter",
          boardName: "Starter Board",
          spentPoints: 50,
          glyph: { glyphId: "glyph_control", level: 15 },
          nodes: [],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects paragon level > 300", () => {
    const result = ParagonAllocationSchema.safeParse({ paragonLevel: 301, boards: [] });
    expect(result.success).toBe(false);
  });

  it("rejects glyph level > 21", () => {
    const result = ParagonAllocationSchema.safeParse({
      paragonLevel: 100,
      boards: [
        {
          boardId: "b1",
          boardName: "Board 1",
          spentPoints: 10,
          glyph: { glyphId: "g1", level: 22 },
          nodes: [],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("PlaystyleConstraintSchema", () => {
  it("accepts valid constraint", () => {
    const result = PlaystyleConstraintSchema.safeParse({
      category: "skill",
      kind: "must",
      payload: { skillId: "sorc_blizzard" },
      hard: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all five categories", () => {
    const categories = ["skill", "damage-type", "mechanic", "content", "item"] as const;
    for (const category of categories) {
      const result = PlaystyleConstraintSchema.safeParse({
        category,
        kind: "avoid",
        payload: {},
        hard: false,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid category", () => {
    const result = PlaystyleConstraintSchema.safeParse({
      category: "unknown",
      kind: "must",
      payload: {},
      hard: false,
    });
    expect(result.success).toBe(false);
  });
});
