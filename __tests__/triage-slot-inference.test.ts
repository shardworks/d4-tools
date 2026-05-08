import { describe, it, expect } from "vitest";
import { resolveSlot } from "../lib/triage/resolve";

describe("Slot inference — armor slots (all classes)", () => {
  const armorClasses = ["Barbarian", "Druid", "Necromancer", "Rogue", "Sorcerer", "Spiritborn"] as const;
  const armorTypes = [
    { type: "Helm", expectedSlot: "helm" },
    { type: "Chest Armor", expectedSlot: "chest" },
    { type: "Gloves", expectedSlot: "gloves" },
    { type: "Pants", expectedSlot: "pants" },
    { type: "Boots", expectedSlot: "boots" },
  ];

  for (const { type, expectedSlot } of armorTypes) {
    for (const className of armorClasses) {
      it(`${type} resolves to ${expectedSlot} for ${className}`, () => {
        const result = resolveSlot(type, className);
        expect(result.kind).toBe("resolved");
        if (result.kind === "resolved") {
          expect(result.slotId).toBe(expectedSlot);
        }
      });
    }
  }
});

describe("Slot inference — jewelry (all classes)", () => {
  const allClasses = ["Barbarian", "Druid", "Necromancer", "Rogue", "Sorcerer", "Spiritborn"] as const;

  it("Amulet resolves to amulet for all classes", () => {
    for (const className of allClasses) {
      const result = resolveSlot("Amulet", className);
      expect(result.kind).toBe("resolved");
      if (result.kind === "resolved") {
        expect(result.slotId).toBe("amulet");
      }
    }
  });

  it("Ring is always ambiguous — resolves to [ring1, ring2] for all classes", () => {
    for (const className of allClasses) {
      const result = resolveSlot("Ring", className);
      expect(result.kind).toBe("ambiguous");
      if (result.kind === "ambiguous") {
        expect(result.candidates).toContain("ring1");
        expect(result.candidates).toContain("ring2");
        expect(result.candidates).toHaveLength(2);
      }
    }
  });
});

describe("Slot inference — weapons (non-Barbarian classes)", () => {
  const nonBarbClasses = ["Druid", "Necromancer", "Rogue", "Sorcerer", "Spiritborn"] as const;

  it("'Sword' maps to 'weapon' for non-Barbarian", () => {
    for (const className of nonBarbClasses) {
      const result = resolveSlot("Sword", className);
      expect(result.kind).toBe("resolved");
      if (result.kind === "resolved") {
        expect(result.slotId).toBe("weapon");
      }
    }
  });

  it("'Two-Handed Mace' maps to 'weapon' for non-Barbarian", () => {
    for (const className of nonBarbClasses) {
      const result = resolveSlot("Two-Handed Mace", className);
      expect(result.kind).toBe("resolved");
      if (result.kind === "resolved") {
        expect(result.slotId).toBe("weapon");
      }
    }
  });

  it("'Off-Hand' maps to 'offHand' for non-Barbarian", () => {
    for (const className of nonBarbClasses) {
      const result = resolveSlot("Off-Hand", className);
      expect(result.kind).toBe("resolved");
      if (result.kind === "resolved") {
        expect(result.slotId).toBe("offHand");
      }
    }
  });
});

describe("Slot inference — Barbarian dual-1H weapons", () => {
  it("'Sword' (1H) is ambiguous for Barbarian — [barb_1h_main, barb_1h_off]", () => {
    const result = resolveSlot("Sword", "Barbarian");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates).toContain("barb_1h_main");
      expect(result.candidates).toContain("barb_1h_off");
    }
  });

  it("'Axe' (1H) is ambiguous for Barbarian", () => {
    const result = resolveSlot("Axe", "Barbarian");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates).toContain("barb_1h_main");
      expect(result.candidates).toContain("barb_1h_off");
    }
  });

  it("'Mace' (1H) is ambiguous for Barbarian", () => {
    const result = resolveSlot("Mace", "Barbarian");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates).toContain("barb_1h_main");
      expect(result.candidates).toContain("barb_1h_off");
    }
  });
});

describe("Slot inference — Barbarian 2H weapon disambiguation", () => {
  it("'Two-Handed Sword' (slashing) maps to barb_2h_slashing for Barbarian", () => {
    const result = resolveSlot("Two-Handed Sword", "Barbarian");
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.slotId).toBe("barb_2h_slashing");
    }
  });

  it("'Two-Handed Axe' (slashing) maps to barb_2h_slashing for Barbarian", () => {
    const result = resolveSlot("Two-Handed Axe", "Barbarian");
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.slotId).toBe("barb_2h_slashing");
    }
  });

  it("'Two-Handed Mace' (bludgeoning) maps to barb_2h_bludgeoning for Barbarian", () => {
    const result = resolveSlot("Two-Handed Mace", "Barbarian");
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.slotId).toBe("barb_2h_bludgeoning");
    }
  });

  it("'Polearm' maps to barb_2h_bludgeoning for Barbarian", () => {
    const result = resolveSlot("Polearm", "Barbarian");
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.slotId).toBe("barb_2h_bludgeoning");
    }
  });
});

describe("Slot inference — class incompatibility (D20)", () => {
  it("Off-hand is incompatible for Barbarian (no offHand slot)", () => {
    const result = resolveSlot("Shield", "Barbarian");
    // Barbarian has no offHand slot — should be incompatible
    expect(result.kind).toBe("incompatible");
  });

  it("Unknown item type is incompatible for any class", () => {
    const result = resolveSlot("InventedItemType9999", "Sorcerer");
    expect(result.kind).toBe("incompatible");
  });
});
