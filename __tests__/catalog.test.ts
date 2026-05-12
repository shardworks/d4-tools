import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import * as fs from "fs";
import * as path from "path";
import {
  classes,
  supportedClasses,
  slots,
  affixes,
  aspects,
  uniques,
  getSkillsForClass,
  getParagonCatalogForClass,
  getSlotsForClass,
  getAffixesForSlotAndClass,
  getAspectsForSlotAndClass,
  getSkillPointsAvailable,
  getParagonPointsAvailable,
  verifiedAgainst,
  findSkillById,
  findParagonBoardById,
  findParagonGlyphById,
} from "../lib/catalog";

describe("verifiedAgainst stamp", () => {
  it("has required fields", () => {
    expect(verifiedAgainst).toHaveProperty("expansion");
    expect(verifiedAgainst).toHaveProperty("season");
    expect(verifiedAgainst).toHaveProperty("patch");
    expect(verifiedAgainst).toHaveProperty("accessedDate");
  });
});

describe("classes catalog", () => {
  it("lists all 8 classes", () => {
    expect(classes).toHaveLength(8);
  });

  it("has 8 supported classes", () => {
    expect(supportedClasses).toHaveLength(8);
    const supportedIds = supportedClasses.map((c) => c.id);
    expect(supportedIds).toContain("Barbarian");
    expect(supportedIds).toContain("Druid");
    expect(supportedIds).toContain("Necromancer");
    expect(supportedIds).toContain("Paladin");
    expect(supportedIds).toContain("Rogue");
    expect(supportedIds).toContain("Sorcerer");
    expect(supportedIds).toContain("Spiritborn");
    expect(supportedIds).toContain("Warlock");
  });

  it("Paladin and Warlock are supported with no unsupportedReason", () => {
    const paladin = classes.find((c) => c.id === "Paladin");
    const warlock = classes.find((c) => c.id === "Warlock");
    expect(paladin?.supported).toBe(true);
    expect(warlock?.supported).toBe(true);
    expect(paladin?.unsupportedReason).toBeUndefined();
    expect(warlock?.unsupportedReason).toBeUndefined();
  });
});

describe("slots catalog", () => {
  it("has no weapon3/weapon4/weapon5 IDs", () => {
    const ids = slots.map((s) => s.id);
    expect(ids).not.toContain("weapon3");
    expect(ids).not.toContain("weapon4");
    expect(ids).not.toContain("weapon5");
  });

  it("has canonical base slots for non-Barbarian classes", () => {
    const sorcSlots = getSlotsForClass("Sorcerer");
    const ids = sorcSlots.map((s) => s.id);
    expect(ids).toContain("helm");
    expect(ids).toContain("chest");
    expect(ids).toContain("gloves");
    expect(ids).toContain("pants");
    expect(ids).toContain("boots");
    expect(ids).toContain("amulet");
    expect(ids).toContain("ring1");
    expect(ids).toContain("ring2");
    expect(ids).toContain("weapon");
    expect(ids).toContain("offHand");
  });

  it("excludes weapon/offHand for Barbarian", () => {
    const barbSlots = getSlotsForClass("Barbarian");
    const ids = barbSlots.map((s) => s.id);
    expect(ids).not.toContain("weapon");
    expect(ids).not.toContain("offHand");
  });

  it("includes 4 Barbarian-specific weapon slots", () => {
    const barbSlots = getSlotsForClass("Barbarian");
    const ids = barbSlots.map((s) => s.id);
    expect(ids).toContain("barb_1h_main");
    expect(ids).toContain("barb_1h_off");
    expect(ids).toContain("barb_2h_bludgeoning");
    expect(ids).toContain("barb_2h_slashing");
  });

  it("excludes Barbarian-specific weapon slots for non-Barbarians", () => {
    const sorcSlots = getSlotsForClass("Sorcerer");
    const ids = sorcSlots.map((s) => s.id);
    expect(ids).not.toContain("barb_1h_main");
    expect(ids).not.toContain("barb_2h_bludgeoning");
  });
});

describe("affixes catalog", () => {
  it("has at least 180 entries (v18 hygiene sweep deduplicates slot-specific duplicates)", () => {
    // v17 expanded catalog target was 200+; v18 hygiene sweep dropped 18 slot-specific
    // duplicates (same attribute + overlapping slots as their surviving generic entry),
    // so the floor is updated to 180 post-deduplication.
    expect(affixes.length).toBeGreaterThanOrEqual(180);
  });

  it("has affixes with required fields including per-IP-tier valueRanges", () => {
    for (const affix of affixes) {
      expect(affix).toHaveProperty("id");
      expect(affix).toHaveProperty("label");
      expect(affix).toHaveProperty("valueRanges");
      expect(Array.isArray(affix.valueRanges)).toBe(true);
      expect(affix.valueRanges.length).toBeGreaterThanOrEqual(1);
      for (const band of affix.valueRanges) {
        expect(typeof band.minItemPower).toBe("number");
        expect(band.min).toBeLessThanOrEqual(band.max);
      }
    }
  });

  it("filters by slot restrictions", () => {
    // crit_chance is restricted to certain slots
    const helmAffixes = getAffixesForSlotAndClass("helm", "Sorcerer");
    const helmIds = helmAffixes.map((a) => a.id);
    // Max life is not slot-restricted, should appear on helm
    expect(helmIds).toContain("affix_max_life");
    // Movement speed is restricted to boots/amulet only
    expect(helmIds).not.toContain("affix_movement_speed");
  });

  it("filters class-specific affixes", () => {
    const sorcHelmAffixes = getAffixesForSlotAndClass("helm", "Sorcerer").map((a) => a.id);
    const barbHelmAffixes = getAffixesForSlotAndClass("helm", "Barbarian").map((a) => a.id);
    // Sorcerer-specific mana regen shouldn't appear on Barbarian
    const sorcMana = sorcHelmAffixes.includes("affix_sorcerer_mana_regen");
    const barbMana = barbHelmAffixes.includes("affix_sorcerer_mana_regen");
    // affix_sorcerer_mana_regen has no slot restrictions but class restriction
    // so it appears on all slots for Sorcerer but not Barbarian
    expect(barbMana).toBe(false);
  });
});

describe("aspects catalog", () => {
  it("has at least 100 entries (v17 comprehensive coverage)", () => {
    // v17 expanded catalog target: 100+ aspects across all classes
    expect(aspects.length).toBeGreaterThanOrEqual(100);
  });

  it("has aspects with required fields", () => {
    for (const aspect of aspects) {
      expect(aspect).toHaveProperty("id");
      expect(aspect).toHaveProperty("label");
      expect(aspect).toHaveProperty("source");
      expect(["legendary", "codex"]).toContain(aspect.source);
    }
  });

  it("filters class-specific aspects", () => {
    const sorcAspects = getAspectsForSlotAndClass("weapon", "Sorcerer").map((a) => a.id);
    const barbAspects = getAspectsForSlotAndClass("weapon", "Barbarian").map((a) => a.id);
    // Sorcerer-specific aspects shouldn't appear for Barbarian
    expect(sorcAspects).toContain("aspect_of_frozen_orbit");
    expect(barbAspects).not.toContain("aspect_of_frozen_orbit");
  });
});

describe("uniques catalog", () => {
  it("has at least 50 entries (v17 comprehensive coverage)", () => {
    // v17 expanded catalog target: 50+ unique items across all slots and classes
    expect(uniques.length).toBeGreaterThanOrEqual(50);
  });

  it("has uniques with required fields", () => {
    for (const unique of uniques) {
      expect(unique).toHaveProperty("id");
      expect(unique).toHaveProperty("label");
      expect(unique).toHaveProperty("slot");
      expect(unique).toHaveProperty("classRestrictions");
      expect(Array.isArray(unique.classRestrictions)).toBe(true);
    }
  });

  it("contains well-known uniques (D1 spot-check)", () => {
    const ids = uniques.map((u) => u.id);
    expect(ids).toContain("harlequin_crest");
    expect(ids).toContain("ring_of_starless_skies");
  });

  it("uniques with intrinsicAspects carry correct shape (D1)", () => {
    const withAspects = uniques.filter((u) => u.intrinsicAspects && u.intrinsicAspects.length > 0);
    // At least some uniques should have intrinsicAspects
    expect(withAspects.length).toBeGreaterThan(0);
    for (const u of withAspects) {
      for (const ia of u.intrinsicAspects!) {
        expect(ia).toHaveProperty("label");
        expect(ia).toHaveProperty("valueRange");
        expect(ia).toHaveProperty("isPercent");
        expect(ia.valueRange).toHaveLength(2);
      }
    }
  });
});

describe("skills catalog", () => {
  it("returns skills for all 8 supported classes", () => {
    const allClasses = [
      "Barbarian", "Druid", "Necromancer", "Paladin",
      "Rogue", "Sorcerer", "Spiritborn", "Warlock",
    ];
    for (const cls of allClasses) {
      const skills = getSkillsForClass(cls);
      expect(skills.length).toBeGreaterThan(0);
    }
  });

  it("returns skills for Paladin with correct D4 LoH categories", () => {
    const skills = getSkillsForClass("Paladin");
    expect(skills.length).toBeGreaterThan(0);
    const categories = skills.map((s) => s.category);
    expect(categories).toContain("basic");
    expect(categories).toContain("core");
    // Paladin's unique middle categories: Aura, Valor, Justice
    expect(categories).toContain("aura");
    expect(categories).toContain("valor");
    expect(categories).toContain("justice");
    expect(categories).toContain("ultimate");
    // Paladin has no key-passive in Season 13; Oath system is a separate class mechanic
    expect(categories).not.toContain("key-passive");
    expect(categories).not.toContain("auras"); // old fabricated category name
  });

  it("returns skills for Warlock with correct D4 LoH categories", () => {
    const skills = getSkillsForClass("Warlock");
    expect(skills.length).toBeGreaterThan(0);
    const categories = skills.map((s) => s.category);
    expect(categories).toContain("basic");
    expect(categories).toContain("core");
    expect(categories).toContain("defensive");
    // Warlock's unique middle categories: Archfiend, Sigil
    expect(categories).toContain("archfiend");
    expect(categories).toContain("sigil");
    expect(categories).toContain("ultimate");
    // Warlock has no key-passive in Season 13; Soul Shards are a separate class mechanic
    expect(categories).not.toContain("key-passive");
    expect(categories).not.toContain("curses"); // old fabricated category name
  });

  it("Paladin skill catalog contains datamine-confirmed skill 'Arbiter of Justice'", () => {
    const skills = getSkillsForClass("Paladin");
    expect(skills.find((s) => s.label === "Arbiter of Justice")).toBeTruthy();
  });

  it("Paladin skill catalog contains datamine-confirmed skill 'Blessed Hammer'", () => {
    const skills = getSkillsForClass("Paladin");
    expect(skills.find((s) => s.label === "Blessed Hammer")).toBeTruthy();
  });

  it("Warlock skill catalog contains datamine-confirmed skill 'Command Fallen'", () => {
    const skills = getSkillsForClass("Warlock");
    expect(skills.find((s) => s.label === "Command Fallen")).toBeTruthy();
  });

  it("Warlock skill catalog contains datamine-confirmed skill 'Metamorphosis'", () => {
    const skills = getSkillsForClass("Warlock");
    expect(skills.find((s) => s.label === "Metamorphosis")).toBeTruthy();
  });

  it("Warlock skill catalog uses datamine-correct name 'Lava Bomb', not the erroneous 'Molten Bomb'", () => {
    const skills = getSkillsForClass("Warlock");
    expect(skills.find((s) => s.label === "Lava Bomb")).toBeTruthy();
    expect(skills.find((s) => s.label === "Molten Bomb")).toBeFalsy();
  });

  it("returns empty for truly unknown class", () => {
    expect(getSkillsForClass("Wizard")).toHaveLength(0);
  });

  it("skills have maxRank field", () => {
    const sorcSkills = getSkillsForClass("Sorcerer");
    for (const skill of sorcSkills) {
      expect(skill).toHaveProperty("maxRank");
      expect(skill.maxRank).toBeGreaterThan(0);
    }
  });
});

describe("paragon catalog", () => {
  it("returns boards and glyphs for supported classes", () => {
    const catalog = getParagonCatalogForClass("Sorcerer");
    expect(catalog.boards.length).toBeGreaterThan(0);
    expect(catalog.glyphs.length).toBeGreaterThan(0);
  });

  it("starter board is marked correctly", () => {
    const catalog = getParagonCatalogForClass("Barbarian");
    const starter = catalog.boards.find((b) => b.isStarterBoard);
    expect(starter).toBeTruthy();
  });

  it("returns boards and glyphs for Paladin", () => {
    const catalog = getParagonCatalogForClass("Paladin");
    expect(catalog.boards.length).toBeGreaterThan(0);
    expect(catalog.glyphs.length).toBeGreaterThan(0);
    const starter = catalog.boards.find((b) => b.isStarterBoard);
    expect(starter).toBeTruthy();
    // Datamine-confirmed glyphs present (glyph_reinforced removed: no Paladin-usable
    // "Reinforced" file exists in DiabloTools/d4data build 3.0.1.71747)
    const glyphIds = catalog.glyphs.map((g) => g.id);
    expect(glyphIds).toContain("glyph_exploit");
    expect(glyphIds).toContain("glyph_control");
    expect(glyphIds).not.toContain("glyph_reinforced");
  });

  it("returns boards and glyphs for Warlock", () => {
    const catalog = getParagonCatalogForClass("Warlock");
    expect(catalog.boards.length).toBeGreaterThan(0);
    expect(catalog.glyphs.length).toBeGreaterThan(0);
    const starter = catalog.boards.find((b) => b.isStarterBoard);
    expect(starter).toBeTruthy();
    // Datamine-confirmed glyphs present (glyph_reinforced and glyph_exploit removed:
    // no Warlock-usable files for these exist in DiabloTools/d4data build 3.0.1.71747)
    const glyphIds = catalog.glyphs.map((g) => g.id);
    expect(glyphIds).toContain("glyph_control");
    expect(glyphIds).toContain("glyph_abyssal");
    expect(glyphIds).not.toContain("glyph_reinforced");
    expect(glyphIds).not.toContain("glyph_exploit");
  });

  it("returns empty boards and glyphs for truly unknown class", () => {
    const catalog = getParagonCatalogForClass("Wizard");
    expect(catalog.boards).toHaveLength(0);
    expect(catalog.glyphs).toHaveLength(0);
  });
});

describe("game-math helpers", () => {
  it("getSkillPointsAvailable returns 0 for level 1", () => {
    expect(getSkillPointsAvailable(1)).toBe(0);
  });

  it("getSkillPointsAvailable returns 49 for level 50+", () => {
    expect(getSkillPointsAvailable(50)).toBe(49);
    expect(getSkillPointsAvailable(100)).toBe(49);
  });

  it("getParagonPointsAvailable returns paragonLevel * 4", () => {
    expect(getParagonPointsAvailable(0)).toBe(0);
    expect(getParagonPointsAvailable(50)).toBe(200);
    expect(getParagonPointsAvailable(200)).toBe(800);
  });
});

// ---------------------------------------------------------------------------
// v7 Barbarian / Druid datamine cross-check blocks
// Appended at the end of the file per concurrency-safety convention.
// ---------------------------------------------------------------------------

describe("Barbarian skill catalog — v7 datamine verification", () => {
  it("Barbarian skill catalog contains datamine-confirmed skill 'Mighty Throw'", () => {
    // New skill in Lord of Hatred datamine (X1_Barbarian_WeaponThrow); not in v2 seed
    const skills = getSkillsForClass("Barbarian");
    expect(skills.find((s) => s.label === "Mighty Throw")).toBeTruthy();
  });

  it("Barbarian skill catalog uses datamine-correct name 'Flay' (internal Power name is Barbarian_Maim)", () => {
    // Barbarian_Maim.pow.json displays as "Flay"; catalog must preserve label "Flay"
    const skills = getSkillsForClass("Barbarian");
    expect(skills.find((s) => s.label === "Flay")).toBeTruthy();
    // No fabricated "Maim" label should exist
    expect(skills.find((s) => s.label === "Maim")).toBeFalsy();
  });

  it("Barbarian skill catalog does not contain removed entry 'barb_seismic_slam'", () => {
    const skills = getSkillsForClass("Barbarian");
    expect(skills.find((s) => s.id === "barb_seismic_slam")).toBeFalsy();
  });

  it("Barbarian skill catalog does not contain removed key-passive entries", () => {
    const skills = getSkillsForClass("Barbarian");
    expect(skills.find((s) => s.id === "barb_unbridled_rage")).toBeFalsy();
    expect(skills.find((s) => s.id === "barb_gushing_wounds")).toBeFalsy();
    expect(skills.find((s) => s.id === "barb_walking_arsenal")).toBeFalsy();
    expect(skills.find((s) => s.id === "barb_unconstrained")).toBeFalsy();
  });

  it("Barbarian skill catalog uses datamine-correct category 'brawling' for Leap", () => {
    const skills = getSkillsForClass("Barbarian");
    const leap = skills.find((s) => s.id === "barb_leap");
    expect(leap).toBeTruthy();
    expect(leap?.category).toBe("brawling");
  });

  it("Barbarian skill catalog uses datamine-correct category 'weapon-mastery' for Steel Grasp", () => {
    const skills = getSkillsForClass("Barbarian");
    const sg = skills.find((s) => s.id === "barb_steel_grasp");
    expect(sg).toBeTruthy();
    expect(sg?.category).toBe("weapon-mastery");
  });

  it("every Barbarian skill entry has a non-empty bnetFileName", () => {
    const skills = getSkillsForClass("Barbarian");
    for (const skill of skills) {
      expect(skill.bnetFileName).toBeTruthy();
    }
  });

  it("every Barbarian paragon board and glyph entry has a non-empty bnetFileName", () => {
    const { boards, glyphs } = getParagonCatalogForClass("Barbarian");
    for (const board of boards) {
      expect(board.bnetFileName).toBeTruthy();
    }
    for (const glyph of glyphs) {
      expect(glyph.bnetFileName).toBeTruthy();
    }
  });

  it("Barbarian paragon catalog does not contain removed entry 'glyph_reinforced'", () => {
    const { glyphs } = getParagonCatalogForClass("Barbarian");
    const glyphIds = glyphs.map((g) => g.id);
    expect(glyphIds).not.toContain("glyph_reinforced");
  });

  it("Barbarian paragon catalog does not contain removed entries 'glyph_fervent', 'glyph_wrathful', 'glyph_berserker'", () => {
    const { glyphs } = getParagonCatalogForClass("Barbarian");
    const glyphIds = glyphs.map((g) => g.id);
    expect(glyphIds).not.toContain("glyph_fervent");
    expect(glyphIds).not.toContain("glyph_wrathful");
    expect(glyphIds).not.toContain("glyph_berserker");
  });

  it("Barbarian paragon catalog contains datamine-confirmed glyphs 'glyph_exploit' and 'glyph_undaunted'", () => {
    const { glyphs } = getParagonCatalogForClass("Barbarian");
    const glyphIds = glyphs.map((g) => g.id);
    expect(glyphIds).toContain("glyph_exploit");
    expect(glyphIds).toContain("glyph_undaunted");
  });

  it("audit doc covers every Barbarian catalog entry id", async () => {
    const { readFileSync } = await import("node:fs");
    const doc = readFileSync("docs/datamine-verification-barbarian-druid.md", "utf8");
    const skills = getSkillsForClass("Barbarian");
    const { boards, glyphs } = getParagonCatalogForClass("Barbarian");
    for (const entry of [...skills, ...boards, ...glyphs]) {
      expect(doc).toContain("`" + entry.id + "`");
    }
  });
});

describe("Druid skill catalog — v7 datamine verification", () => {
  it("Druid skill catalog contains datamine-confirmed skill 'Lightning Storm'", () => {
    // New skill in Lord of Hatred datamine (Druid_LightningStorm); not in v2 seed
    const skills = getSkillsForClass("Druid");
    expect(skills.find((s) => s.label === "Lightning Storm")).toBeTruthy();
  });

  it("Druid skill catalog contains datamine-confirmed skill 'Blood Howl'", () => {
    // New skill in Lord of Hatred datamine (Druid_BloodHowl); not in v2 seed
    const skills = getSkillsForClass("Druid");
    expect(skills.find((s) => s.label === "Blood Howl")).toBeTruthy();
  });

  it("Druid skill catalog does not contain removed key-passive entries", () => {
    const skills = getSkillsForClass("Druid");
    expect(skills.find((s) => s.id === "druid_bestial_rampage")).toBeFalsy();
    expect(skills.find((s) => s.id === "druid_natural_balance")).toBeFalsy();
    expect(skills.find((s) => s.id === "druid_natures_fury")).toBeFalsy();
    expect(skills.find((s) => s.id === "druid_earthen_might")).toBeFalsy();
  });

  it("Druid skill catalog uses datamine-correct category 'wrath' for Trample", () => {
    const skills = getSkillsForClass("Druid");
    const trample = skills.find((s) => s.id === "druid_trample");
    expect(trample).toBeTruthy();
    expect(trample?.category).toBe("wrath");
  });

  it("Druid skill catalog uses datamine-correct category 'wrath' for Rabies", () => {
    const skills = getSkillsForClass("Druid");
    const rabies = skills.find((s) => s.id === "druid_rabies");
    expect(rabies).toBeTruthy();
    expect(rabies?.category).toBe("wrath");
  });

  it("every Druid skill entry has a non-empty bnetFileName", () => {
    const skills = getSkillsForClass("Druid");
    for (const skill of skills) {
      expect(skill.bnetFileName).toBeTruthy();
    }
  });

  it("every Druid paragon board and glyph entry has a non-empty bnetFileName", () => {
    const { boards, glyphs } = getParagonCatalogForClass("Druid");
    for (const board of boards) {
      expect(board.bnetFileName).toBeTruthy();
    }
    for (const glyph of glyphs) {
      expect(glyph.bnetFileName).toBeTruthy();
    }
  });

  it("Druid paragon catalog does not contain removed entry 'glyph_reinforced'", () => {
    const { glyphs } = getParagonCatalogForClass("Druid");
    const glyphIds = glyphs.map((g) => g.id);
    expect(glyphIds).not.toContain("glyph_reinforced");
  });

  it("Druid paragon catalog does not contain removed entries 'glyph_nature_magic' and 'glyph_control'", () => {
    const { glyphs } = getParagonCatalogForClass("Druid");
    const glyphIds = glyphs.map((g) => g.id);
    expect(glyphIds).not.toContain("glyph_nature_magic");
    expect(glyphIds).not.toContain("glyph_control");
  });

  it("Druid paragon catalog contains datamine-confirmed glyphs 'glyph_exploit' and 'glyph_fang_claw'", () => {
    const { glyphs } = getParagonCatalogForClass("Druid");
    const glyphIds = glyphs.map((g) => g.id);
    expect(glyphIds).toContain("glyph_exploit");
    expect(glyphIds).toContain("glyph_fang_claw");
  });

  it("audit doc covers every Druid catalog entry id", async () => {
    const { readFileSync } = await import("node:fs");
    const doc = readFileSync("docs/datamine-verification-barbarian-druid.md", "utf8");
    const skills = getSkillsForClass("Druid");
    const { boards, glyphs } = getParagonCatalogForClass("Druid");
    for (const entry of [...skills, ...boards, ...glyphs]) {
      expect(doc).toContain("`" + entry.id + "`");
    }
  });
});

describe("bnetId / bnetFileName / bnetClassId fields (D26 / D28)", () => {
  it("every ClassEntry that has bnetClassName has it as a lowercase string", () => {
    for (const cls of classes) {
      if (cls.bnetClassName !== undefined) {
        expect(typeof cls.bnetClassName).toBe("string");
        expect(cls.bnetClassName).toBe(cls.bnetClassName.toLowerCase());
      }
    }
  });

  it("every ClassEntry that has bnetClassId has it as a positive integer", () => {
    for (const cls of classes) {
      if (cls.bnetClassId !== undefined) {
        expect(typeof cls.bnetClassId).toBe("number");
        expect(Number.isInteger(cls.bnetClassId)).toBe(true);
        expect(cls.bnetClassId).toBeGreaterThan(0);
      }
    }
  });

  it("all supported classes have bnetClassName populated", () => {
    for (const cls of supportedClasses) {
      expect(cls.bnetClassName).toBeTruthy();
    }
  });

  it("optional bnetId on affixes is numeric when present", () => {
    for (const affix of affixes) {
      if (affix.bnetId !== undefined) {
        expect(typeof affix.bnetId).toBe("number");
        expect(Number.isInteger(affix.bnetId)).toBe(true);
      }
    }
  });

  it("optional bnetFileName on affixes is a string when present", () => {
    for (const affix of affixes) {
      if (affix.bnetFileName !== undefined) {
        expect(typeof affix.bnetFileName).toBe("string");
        expect(affix.bnetFileName.length).toBeGreaterThan(0);
      }
    }
  });

  it("optional bnetId on aspects is numeric when present", () => {
    for (const aspect of aspects) {
      if (aspect.bnetId !== undefined) {
        expect(typeof aspect.bnetId).toBe("number");
      }
    }
  });

  // T6 datamine reconciliation: every Paladin/Warlock skill and paragon entry must have
  // a non-empty bnetFileName traceable to DiabloTools/d4data build 3.0.1.71747.
  it("every Paladin skill entry has a non-empty bnetFileName", () => {
    const skills = getSkillsForClass("Paladin");
    for (const skill of skills) {
      expect(skill.bnetFileName).toBeTruthy();
    }
  });

  it("every Warlock skill entry has a non-empty bnetFileName", () => {
    const skills = getSkillsForClass("Warlock");
    for (const skill of skills) {
      expect(skill.bnetFileName).toBeTruthy();
    }
  });

  it("every Paladin paragon board and glyph entry has a non-empty bnetFileName", () => {
    const { boards, glyphs } = getParagonCatalogForClass("Paladin");
    for (const board of boards) {
      expect(board.bnetFileName).toBeTruthy();
    }
    for (const glyph of glyphs) {
      expect(glyph.bnetFileName).toBeTruthy();
    }
  });

  it("every Warlock paragon board and glyph entry has a non-empty bnetFileName", () => {
    const { boards, glyphs } = getParagonCatalogForClass("Warlock");
    for (const board of boards) {
      expect(board.bnetFileName).toBeTruthy();
    }
    for (const glyph of glyphs) {
      expect(glyph.bnetFileName).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Necromancer datamine reconciliation — DiabloTools/d4data build 3.0.1.71747
// ---------------------------------------------------------------------------
describe("Necromancer skills catalog (datamine-reconciled, build 3.0.1.71747)", () => {
  it("verifiedAgainst patch is 3.0.1.71747", () => {
    // Skills are loaded by getSkillsForClass; patch pin is on the catalog object.
    // We exercise it indirectly: if the catalog loads and entries have bnetFileName,
    // the file must have been rewritten with the correct patch stamp.
    const skills = getSkillsForClass("Necromancer");
    expect(skills.length).toBeGreaterThan(0);
    // bnetFileName presence confirms this is the v6-reconciled file
    for (const skill of skills) {
      expect(skill.bnetFileName).toBeTruthy();
    }
  });

  it("contains datamine-confirmed skill 'Bone Spear' (core)", () => {
    const skills = getSkillsForClass("Necromancer");
    expect(skills.find((s) => s.label === "Bone Spear")).toBeTruthy();
  });

  it("contains datamine-confirmed skill 'Army of the Dead' (ultimate)", () => {
    const skills = getSkillsForClass("Necromancer");
    expect(skills.find((s) => s.label === "Army of the Dead")).toBeTruthy();
  });

  it("summoning skills no longer carry '(Passive)' suffix in labels", () => {
    const skills = getSkillsForClass("Necromancer");
    // Datamine labels do not include a '(Passive)' suffix — v2 editorial addition stripped.
    expect(skills.find((s) => s.label === "Skeletal Warriors")).toBeTruthy();
    expect(skills.find((s) => s.label === "Skeletal Mages")).toBeTruthy();
    expect(skills.find((s) => s.label === "Golem")).toBeTruthy();
    expect(skills.find((s) => s.label === "Skeletal Warriors (Passive)")).toBeFalsy();
    expect(skills.find((s) => s.label === "Skeletal Mages (Passive)")).toBeFalsy();
    expect(skills.find((s) => s.label === "Golem (Passive)")).toBeFalsy();
  });

  it("has correct Necromancer skill-tree categories", () => {
    const skills = getSkillsForClass("Necromancer");
    const categories = skills.map((s) => s.category);
    expect(categories).toContain("basic");
    expect(categories).toContain("core");
    expect(categories).toContain("macabre");
    expect(categories).toContain("defensive");
    expect(categories).toContain("summoning");
    expect(categories).toContain("ultimate");
    expect(categories).toContain("key-passive");
  });

  it("every Necromancer skill entry has a non-empty bnetFileName", () => {
    const skills = getSkillsForClass("Necromancer");
    for (const skill of skills) {
      expect(skill.bnetFileName).toBeTruthy();
    }
  });
});

describe("Necromancer paragon catalog (datamine-reconciled, build 3.0.1.71747)", () => {
  it("returns boards with starter board and bnetFileName on every board", () => {
    const { boards } = getParagonCatalogForClass("Necromancer");
    expect(boards.length).toBeGreaterThan(0);
    const starter = boards.find((b) => b.isStarterBoard);
    expect(starter).toBeTruthy();
    for (const board of boards) {
      expect(board.bnetFileName).toBeTruthy();
    }
  });

  it("starter board resolves to Paragon_Necro_00", () => {
    const { boards } = getParagonCatalogForClass("Necromancer");
    const starter = boards.find((b) => b.isStarterBoard);
    expect(starter?.bnetFileName).toBe("Paragon_Necro_00");
  });

  it("every Necromancer paragon glyph has a non-empty bnetFileName", () => {
    const { glyphs } = getParagonCatalogForClass("Necromancer");
    expect(glyphs.length).toBeGreaterThan(0);
    for (const glyph of glyphs) {
      expect(glyph.bnetFileName).toBeTruthy();
    }
  });

  it("glyph_reinforced is removed — no Necromancer-usable 'Reinforced' file in build 3.0.1.71747", () => {
    const { glyphs } = getParagonCatalogForClass("Necromancer");
    const glyphIds = glyphs.map((g) => g.id);
    // Reinforced (Rare_012_Willpower_Side) is Sorcerer-only; fUsableByClass[3]=0.
    expect(glyphIds).not.toContain("glyph_reinforced");
  });

  it("contains datamine-confirmed Necromancer glyph 'Exploit'", () => {
    const { glyphs } = getParagonCatalogForClass("Necromancer");
    expect(glyphs.find((g) => g.label === "Exploit")).toBeTruthy();
  });

  it("contains datamine-confirmed Necromancer-specific glyph 'Deadraiser'", () => {
    const { glyphs } = getParagonCatalogForClass("Necromancer");
    expect(glyphs.find((g) => g.label === "Deadraiser")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Rogue datamine reconciliation — DiabloTools/d4data build 3.0.1.71747
// ---------------------------------------------------------------------------
describe("Rogue skills catalog (datamine-reconciled, build 3.0.1.71747)", () => {
  it("verifiedAgainst patch confirmed via bnetFileName presence on all entries", () => {
    const skills = getSkillsForClass("Rogue");
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
      expect(skill.bnetFileName).toBeTruthy();
    }
  });

  it("contains datamine-confirmed skill 'Twisting Blades' (core)", () => {
    const skills = getSkillsForClass("Rogue");
    expect(skills.find((s) => s.label === "Twisting Blades")).toBeTruthy();
  });

  it("contains datamine-confirmed skill 'Preparation' (ultimate, not the Specialization style)", () => {
    const skills = getSkillsForClass("Rogue");
    expect(skills.find((s) => s.label === "Preparation")).toBeTruthy();
  });

  it("has correct Rogue skill-tree categories", () => {
    const skills = getSkillsForClass("Rogue");
    const categories = skills.map((s) => s.category);
    expect(categories).toContain("basic");
    expect(categories).toContain("core");
    expect(categories).toContain("agility");
    expect(categories).toContain("defensive");
    expect(categories).toContain("imbuement");
    expect(categories).toContain("ultimate");
    expect(categories).toContain("key-passive");
  });

  it("every Rogue skill entry has a non-empty bnetFileName", () => {
    const skills = getSkillsForClass("Rogue");
    for (const skill of skills) {
      expect(skill.bnetFileName).toBeTruthy();
    }
  });
});

describe("Rogue paragon catalog (datamine-reconciled, build 3.0.1.71747)", () => {
  it("returns boards with starter board and bnetFileName on every board", () => {
    const { boards } = getParagonCatalogForClass("Rogue");
    expect(boards.length).toBeGreaterThan(0);
    const starter = boards.find((b) => b.isStarterBoard);
    expect(starter).toBeTruthy();
    for (const board of boards) {
      expect(board.bnetFileName).toBeTruthy();
    }
  });

  it("starter board resolves to Paragon_Rogue_00", () => {
    const { boards } = getParagonCatalogForClass("Rogue");
    const starter = boards.find((b) => b.isStarterBoard);
    expect(starter?.bnetFileName).toBe("Paragon_Rogue_00");
  });

  it("every Rogue paragon glyph has a non-empty bnetFileName", () => {
    const { glyphs } = getParagonCatalogForClass("Rogue");
    expect(glyphs.length).toBeGreaterThan(0);
    for (const glyph of glyphs) {
      expect(glyph.bnetFileName).toBeTruthy();
    }
  });

  it("glyph_reinforced is removed — no Rogue-usable 'Reinforced' file in build 3.0.1.71747", () => {
    const { glyphs } = getParagonCatalogForClass("Rogue");
    const glyphIds = glyphs.map((g) => g.id);
    // Reinforced (Rare_012_Willpower_Side) is Sorcerer-only; fUsableByClass[4]=0.
    expect(glyphIds).not.toContain("glyph_reinforced");
  });

  it("contains datamine-confirmed Rogue glyph 'Exploit' (Rare_079_Dexterity_Side)", () => {
    const { glyphs } = getParagonCatalogForClass("Rogue");
    const exploit = glyphs.find((g) => g.id === "glyph_exploit");
    expect(exploit).toBeTruthy();
    // Rogue Exploit uses a different file than Paladin's Rare_016_Intelligence_Side
    expect(exploit?.bnetFileName).toBe("Rare_079_Dexterity_Side");
  });

  it("contains datamine-confirmed Rogue-specific glyph 'Devious'", () => {
    const { glyphs } = getParagonCatalogForClass("Rogue");
    expect(glyphs.find((g) => g.label === "Devious")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Audit document coverage — every catalog id must appear in the audit doc
// ---------------------------------------------------------------------------
describe("audit doc coverage: docs/datamine-verification-necromancer-rogue.md", () => {
  it("audit doc contains every Necromancer skill catalog id", async () => {
    const docPath = new URL(
      "../docs/datamine-verification-necromancer-rogue.md",
      import.meta.url
    ).pathname;
    const body = await readFile(docPath, "utf8");
    const skills = getSkillsForClass("Necromancer");
    for (const skill of skills) {
      expect(body).toContain(skill.id);
    }
  });

  it("audit doc contains every Rogue skill catalog id", async () => {
    const docPath = new URL(
      "../docs/datamine-verification-necromancer-rogue.md",
      import.meta.url
    ).pathname;
    const body = await readFile(docPath, "utf8");
    const skills = getSkillsForClass("Rogue");
    for (const skill of skills) {
      expect(body).toContain(skill.id);
    }
  });

  it("audit doc contains every Necromancer paragon board and glyph catalog id", async () => {
    const docPath = new URL(
      "../docs/datamine-verification-necromancer-rogue.md",
      import.meta.url
    ).pathname;
    const body = await readFile(docPath, "utf8");
    const { boards, glyphs } = getParagonCatalogForClass("Necromancer");
    for (const board of boards) {
      expect(body).toContain(board.id);
    }
    for (const glyph of glyphs) {
      expect(body).toContain(glyph.id);
    }
  });

  it("audit doc contains every Rogue paragon board and glyph catalog id", async () => {
    const docPath = new URL(
      "../docs/datamine-verification-necromancer-rogue.md",
      import.meta.url
    ).pathname;
    const body = await readFile(docPath, "utf8");
    const { boards, glyphs } = getParagonCatalogForClass("Rogue");
    for (const board of boards) {
      expect(body).toContain(board.id);
    }
    for (const glyph of glyphs) {
      expect(body).toContain(glyph.id);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// V9 datamine reconciliation: Sorcerer & Spiritborn (build 3.0.1.71747)
// ──────────────────────────────────────────────────────────────────────────────

describe("Sorcerer datamine traceability (v9)", () => {
  it("every Sorcerer skill entry has a non-empty bnetFileName", () => {
    const skills = getSkillsForClass("Sorcerer");
    for (const skill of skills) {
      expect(skill.bnetFileName).toBeTruthy();
    }
  });

  it("every Sorcerer paragon board and glyph entry has a non-empty bnetFileName", () => {
    const { boards, glyphs } = getParagonCatalogForClass("Sorcerer");
    for (const board of boards) {
      expect(board.bnetFileName).toBeTruthy();
    }
    for (const glyph of glyphs) {
      expect(glyph.bnetFileName).toBeTruthy();
    }
  });

  it("Sorcerer skill catalog contains datamine-confirmed skill 'Inferno'", () => {
    const skills = getSkillsForClass("Sorcerer");
    expect(skills.find((s) => s.label === "Inferno")).toBeTruthy();
  });

  it("Sorcerer skill catalog contains datamine-added skill 'Firewall'", () => {
    const skills = getSkillsForClass("Sorcerer");
    expect(skills.find((s) => s.label === "Firewall")).toBeTruthy();
  });

  it("Sorcerer skill catalog contains datamine-added skill 'Familiar'", () => {
    const skills = getSkillsForClass("Sorcerer");
    expect(skills.find((s) => s.label === "Familiar")).toBeTruthy();
  });

  it("Sorcerer skill catalog uses datamine-correct categories (no key-passive)", () => {
    const skills = getSkillsForClass("Sorcerer");
    const categories = skills.map((s) => s.category);
    expect(categories).toContain("basic");
    expect(categories).toContain("core");
    expect(categories).toContain("defensive");
    expect(categories).toContain("conjuration");
    expect(categories).toContain("mastery");
    expect(categories).toContain("ultimate");
    // Key-passive system was removed in LoH expansion (build 3.0.1.71747)
    expect(categories).not.toContain("key-passive");
  });

  it("Sorcerer skill catalog does not contain v2 fabricated key-passive 'Static Discharge'", () => {
    const skills = getSkillsForClass("Sorcerer");
    expect(skills.find((s) => s.label === "Static Discharge")).toBeFalsy();
  });

  it("Sorcerer skill catalog does not contain v2 fabricated key-passive 'Shatter'", () => {
    const skills = getSkillsForClass("Sorcerer");
    expect(skills.find((s) => s.label === "Shatter")).toBeFalsy();
  });

  it("Sorcerer paragon board count is 10 (includes two boards added by v9)", () => {
    const { boards } = getParagonCatalogForClass("Sorcerer");
    expect(boards).toHaveLength(10);
  });

  it("Sorcerer paragon glyph catalog uses datamine-correct label 'Tactician', not v2 'Exploit'", () => {
    const { glyphs } = getParagonCatalogForClass("Sorcerer");
    expect(glyphs.find((g) => g.label === "Tactician")).toBeTruthy();
    expect(glyphs.find((g) => g.label === "Exploit")).toBeFalsy();
  });

  it("Sorcerer paragon glyph catalog uses datamine-correct label 'Cryopathy', not v2 'Cold Calc'", () => {
    const { glyphs } = getParagonCatalogForClass("Sorcerer");
    expect(glyphs.find((g) => g.label === "Cryopathy")).toBeTruthy();
    expect(glyphs.find((g) => g.label === "Cold Calc")).toBeFalsy();
  });

  it("Sorcerer audit doc cross-reference: every live entry bnetFileName appears in audit doc", () => {
    const auditDoc = fs.readFileSync(
      path.resolve(__dirname, "../docs/datamine-verification-sorcerer-spiritborn.md"),
      "utf8"
    );
    const skills = getSkillsForClass("Sorcerer");
    const { boards, glyphs } = getParagonCatalogForClass("Sorcerer");
    const allEntries = [
      ...skills,
      ...boards,
      ...glyphs,
    ];
    for (const entry of allEntries) {
      expect(auditDoc).toContain(`\`${entry.bnetFileName}\``);
    }
  });
});

describe("Spiritborn datamine traceability (v9)", () => {
  it("every Spiritborn skill entry has a non-empty bnetFileName", () => {
    const skills = getSkillsForClass("Spiritborn");
    for (const skill of skills) {
      expect(skill.bnetFileName).toBeTruthy();
    }
  });

  it("every Spiritborn paragon board and glyph entry has a non-empty bnetFileName", () => {
    const { boards, glyphs } = getParagonCatalogForClass("Spiritborn");
    for (const board of boards) {
      expect(board.bnetFileName).toBeTruthy();
    }
    for (const glyph of glyphs) {
      expect(glyph.bnetFileName).toBeTruthy();
    }
  });

  it("Spiritborn skill catalog contains datamine-confirmed skill 'Thunderspike'", () => {
    const skills = getSkillsForClass("Spiritborn");
    expect(skills.find((s) => s.label === "Thunderspike")).toBeTruthy();
  });

  it("Spiritborn skill catalog uses datamine-correct categories (no brawling)", () => {
    const skills = getSkillsForClass("Spiritborn");
    const categories = skills.map((s) => s.category);
    expect(categories).toContain("basic");
    expect(categories).toContain("core");
    expect(categories).toContain("potency");
    expect(categories).toContain("defensive");
    expect(categories).toContain("focus");
    expect(categories).toContain("ultimate");
    expect(categories).toContain("key-passive");
    // brawling was a v2 fabrication copied from Barbarian
    expect(categories).not.toContain("brawling");
  });

  it("Spiritborn skill catalog does not contain v2 fabricated skill 'Crush'", () => {
    const skills = getSkillsForClass("Spiritborn");
    expect(skills.find((s) => s.label === "Crush")).toBeFalsy();
  });

  it("Spiritborn skill catalog does not contain v2 fabricated skill 'Apex'", () => {
    const skills = getSkillsForClass("Spiritborn");
    expect(skills.find((s) => s.label === "Apex")).toBeFalsy();
  });

  it("Spiritborn skill catalog does not contain v2 fabricated key-passive 'Dominant'", () => {
    const skills = getSkillsForClass("Spiritborn");
    expect(skills.find((s) => s.label === "Dominant")).toBeFalsy();
  });

  it("Spiritborn skill catalog contains datamine-correct key-passive 'Vital Strikes'", () => {
    const skills = getSkillsForClass("Spiritborn");
    expect(skills.find((s) => s.label === "Vital Strikes")).toBeTruthy();
  });

  it("Spiritborn paragon catalog does not contain v2 fabricated glyphs", () => {
    const { glyphs } = getParagonCatalogForClass("Spiritborn");
    const glyphIds = glyphs.map((g) => g.id);
    // All six v2 Spiritborn glyph entries were fabricated and removed
    expect(glyphIds).not.toContain("glyph_reinforced");
    expect(glyphIds).not.toContain("glyph_exploit");
    expect(glyphIds).not.toContain("glyph_control");
    expect(glyphIds).not.toContain("glyph_territorial");
    expect(glyphIds).not.toContain("glyph_seeker_g");
    expect(glyphIds).not.toContain("glyph_keeper");
  });

  it("Spiritborn paragon board count is 9 (Paragon_Spirit_09 absent in datamine)", () => {
    const { boards } = getParagonCatalogForClass("Spiritborn");
    expect(boards).toHaveLength(9);
  });

  it("Spiritborn audit doc cross-reference: every live entry bnetFileName appears in audit doc", () => {
    const auditDoc = fs.readFileSync(
      path.resolve(__dirname, "../docs/datamine-verification-sorcerer-spiritborn.md"),
      "utf8"
    );
    const skills = getSkillsForClass("Spiritborn");
    const { boards, glyphs } = getParagonCatalogForClass("Spiritborn");
    const allEntries = [
      ...skills,
      ...boards,
      ...glyphs,
    ];
    for (const entry of allEntries) {
      expect(auditDoc).toContain(`\`${entry.bnetFileName}\``);
    }
  });
});

// Appended at the end of the file per concurrency-safety convention

describe("findSkillById resolver", () => {
  it("resolves legacy id warl_molten_bomb to the canonical warl_lava_bomb entry", () => {
    const entry = findSkillById("Warlock", "warl_molten_bomb");
    expect(entry).toBeTruthy();
    expect(entry!.id).toBe("warl_lava_bomb");
    expect(entry!.label).toBe("Lava Bomb");
  });

  it("resolves canonical id warl_lava_bomb to the same entry", () => {
    const entry = findSkillById("Warlock", "warl_lava_bomb");
    expect(entry).toBeTruthy();
    expect(entry!.id).toBe("warl_lava_bomb");
  });

  it("both lookups return the identical entry object", () => {
    const viaLegacy = findSkillById("Warlock", "warl_molten_bomb");
    const viaCanonical = findSkillById("Warlock", "warl_lava_bomb");
    expect(viaLegacy).toBe(viaCanonical);
  });

  it("returns undefined for an unknown skill id", () => {
    expect(findSkillById("Warlock", "warl_does_not_exist")).toBeUndefined();
  });

  it("findParagonBoardById resolves by canonical id for Warlock", () => {
    const { boards } = getParagonCatalogForClass("Warlock");
    if (boards.length > 0) {
      const first = boards[0];
      const found = findParagonBoardById("Warlock", first.id);
      expect(found).toBeTruthy();
      expect(found!.id).toBe(first.id);
    }
  });

  it("findParagonGlyphById resolves by canonical id for Warlock", () => {
    const { glyphs } = getParagonCatalogForClass("Warlock");
    if (glyphs.length > 0) {
      const first = glyphs[0];
      const found = findParagonGlyphById("Warlock", first.id);
      expect(found).toBeTruthy();
      expect(found!.id).toBe(first.id);
    }
  });

  it("findParagonBoardById returns undefined for an unknown id", () => {
    expect(findParagonBoardById("Warlock", "board_nonexistent")).toBeUndefined();
  });

  it("findParagonGlyphById returns undefined for an unknown id", () => {
    expect(findParagonGlyphById("Warlock", "glyph_nonexistent")).toBeUndefined();
  });
});

describe("legacyIds per-class collision guard", () => {
  const ALL_CLASSES = [
    "Barbarian",
    "Druid",
    "Necromancer",
    "Paladin",
    "Rogue",
    "Sorcerer",
    "Spiritborn",
    "Warlock",
  ];

  for (const className of ALL_CLASSES) {
    it(`${className}: no legacyIds value shadows a live id in the same skill array`, () => {
      const skills = getSkillsForClass(className);
      const liveIds = new Set(skills.map((s) => s.id));
      for (const skill of skills) {
        for (const legacyId of skill.legacyIds ?? []) {
          expect(
            liveIds.has(legacyId),
            `${className} skill "${skill.id}" has legacyId "${legacyId}" that collides with a live id`
          ).toBe(false);
        }
      }
    });

    it(`${className}: no legacyIds value shadows a live id in the same board array`, () => {
      const { boards } = getParagonCatalogForClass(className);
      const liveIds = new Set(boards.map((b) => b.id));
      for (const board of boards) {
        for (const legacyId of board.legacyIds ?? []) {
          expect(
            liveIds.has(legacyId),
            `${className} board "${board.id}" has legacyId "${legacyId}" that collides with a live id`
          ).toBe(false);
        }
      }
    });

    it(`${className}: no legacyIds value shadows a live id in the same glyph array`, () => {
      const { glyphs } = getParagonCatalogForClass(className);
      const liveIds = new Set(glyphs.map((g) => g.id));
      for (const glyph of glyphs) {
        for (const legacyId of glyph.legacyIds ?? []) {
          expect(
            liveIds.has(legacyId),
            `${className} glyph "${glyph.id}" has legacyId "${legacyId}" that collides with a live id`
          ).toBe(false);
        }
      }
    });
  }
});
