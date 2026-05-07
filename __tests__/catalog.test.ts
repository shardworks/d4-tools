import { describe, it, expect } from "vitest";
import {
  classes,
  supportedClasses,
  slots,
  affixes,
  aspects,
  getSkillsForClass,
  getParagonCatalogForClass,
  getSlotsForClass,
  getAffixesForSlotAndClass,
  getAspectsForSlotAndClass,
  getSkillPointsAvailable,
  getParagonPointsAvailable,
  verifiedAgainst,
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

  it("has 6 supported classes", () => {
    expect(supportedClasses).toHaveLength(6);
    const supportedIds = supportedClasses.map((c) => c.id);
    expect(supportedIds).toContain("Barbarian");
    expect(supportedIds).toContain("Druid");
    expect(supportedIds).toContain("Necromancer");
    expect(supportedIds).toContain("Rogue");
    expect(supportedIds).toContain("Sorcerer");
    expect(supportedIds).toContain("Spiritborn");
  });

  it("flags Paladin and Warlock as not supported", () => {
    const paladin = classes.find((c) => c.id === "Paladin");
    const warlock = classes.find((c) => c.id === "Warlock");
    expect(paladin?.supported).toBe(false);
    expect(warlock?.supported).toBe(false);
    expect(paladin?.unsupportedReason).toBeTruthy();
    expect(warlock?.unsupportedReason).toBeTruthy();
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
  it("has affixes with required fields", () => {
    for (const affix of affixes) {
      expect(affix).toHaveProperty("id");
      expect(affix).toHaveProperty("label");
      expect(affix).toHaveProperty("valueRange");
      expect(affix.valueRange).toHaveLength(2);
      expect(affix.valueRange[0]).toBeLessThanOrEqual(affix.valueRange[1]);
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

describe("skills catalog", () => {
  it("returns skills for all 6 supported classes", () => {
    const supportedClasses = ["Barbarian", "Druid", "Necromancer", "Rogue", "Sorcerer", "Spiritborn"];
    for (const cls of supportedClasses) {
      const skills = getSkillsForClass(cls);
      expect(skills.length).toBeGreaterThan(0);
    }
  });

  it("returns empty for unsupported classes", () => {
    expect(getSkillsForClass("Paladin")).toHaveLength(0);
    expect(getSkillsForClass("Warlock")).toHaveLength(0);
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
});
