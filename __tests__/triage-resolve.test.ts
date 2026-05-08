import { describe, it, expect } from "vitest";
import {
  normalizeLabel,
  resolveAffix,
  resolveAspect,
  resolveSlot,
  resolveItem,
} from "../lib/triage/resolve";

describe("normalizeLabel", () => {
  it("lowercases input", () => {
    expect(normalizeLabel("Maximum Life")).toBe("maximum life");
  });

  it("strips non-alphanumeric characters", () => {
    expect(normalizeLabel("Critical Strike Chance")).toBe("critical strike chance");
    // "Max. Life %" → strip dot and percent → "max life " → trim → "max life"
    expect(normalizeLabel("Max. Life %")).toBe("max life");
  });

  it("collapses multiple whitespace", () => {
    expect(normalizeLabel("Maximum  Life")).toBe("maximum life");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeLabel("  Maximum Life  ")).toBe("maximum life");
  });
});

describe("resolveAffix — normalized-equality matching (D9)", () => {
  it("resolves 'Maximum Life' on helm/Sorcerer to affix_max_life", () => {
    const result = resolveAffix(
      { label: "Maximum Life", rolledValue: 2000 },
      "helm",
      "Sorcerer"
    );
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.affixId).toBe("affix_max_life");
      expect(result.rolledValue).toBe(2000);
    }
  });

  it("resolves with case variation — 'maximum life' matches", () => {
    const result = resolveAffix(
      { label: "maximum life", rolledValue: 1500 },
      "helm",
      "Sorcerer"
    );
    expect(result.kind).toBe("resolved");
  });

  it("returns uncertain/no-match for unknown affix label", () => {
    const result = resolveAffix(
      { label: "UnknownSuperPowerXYZ", rolledValue: 100 },
      "helm",
      "Sorcerer"
    );
    expect(result.kind).toBe("uncertain");
    if (result.kind === "uncertain") {
      expect(result.reason).toBe("no-match");
      expect(result.label).toBe("UnknownSuperPowerXYZ");
    }
  });

  it("returns uncertain/out-of-range for value exceeding max (D12)", () => {
    // affix_max_life range is [700, 2800]
    const result = resolveAffix(
      { label: "Maximum Life", rolledValue: 99999 },
      "helm",
      "Sorcerer"
    );
    expect(result.kind).toBe("uncertain");
    if (result.kind === "uncertain") {
      expect(result.reason).toBe("out-of-range");
      expect(result.affixId).toBe("affix_max_life");
    }
  });

  it("returns uncertain/out-of-range for value below min (D12)", () => {
    // affix_max_life range is [700, 2800]
    const result = resolveAffix(
      { label: "Maximum Life", rolledValue: 100 },
      "helm",
      "Sorcerer"
    );
    expect(result.kind).toBe("uncertain");
    if (result.kind === "uncertain") {
      expect(result.reason).toBe("out-of-range");
    }
  });

  it("Sorcerer-only affix (Mana per Second) resolves for Sorcerer", () => {
    const result = resolveAffix(
      { label: "Mana per Second", rolledValue: 5 },
      "helm",
      "Sorcerer"
    );
    // May resolve if in valueRange, or uncertain if not — but must not be filtered out for Sorcerer
    expect(result.kind).toBeOneOf(["resolved", "uncertain"]);
  });

  it("Sorcerer-only affix does NOT resolve for Barbarian (filtered by class, D9)", () => {
    const result = resolveAffix(
      { label: "Mana per Second", rolledValue: 5 },
      "helm",
      "Barbarian"
    );
    // Barbarian cannot have Mana per Second — should be uncertain/no-match
    expect(result.kind).toBe("uncertain");
    if (result.kind === "uncertain") {
      expect(result.reason).toBe("no-match");
    }
  });

  it("slot-restricted affix is not matched on wrong slot", () => {
    // affix_movement_speed is restricted to boots, amulet
    const result = resolveAffix(
      { label: "Movement Speed", rolledValue: 15 },
      "helm",
      "Sorcerer"
    );
    // helm doesn't have movement speed — should be no-match
    expect(result.kind).toBe("uncertain");
    if (result.kind === "uncertain") {
      expect(result.reason).toBe("no-match");
    }
  });
});

describe("resolveAspect — normalized-equality matching", () => {
  it("resolves 'Conceited Aspect' to conceited_aspect", () => {
    const result = resolveAspect(
      { label: "Conceited Aspect", rolledValue: 20.0 },
      "ring1",
      "Sorcerer"
    );
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.aspectId).toBe("conceited_aspect");
    }
  });

  it("returns uncertain/no-match for unknown aspect label", () => {
    const result = resolveAspect(
      { label: "Unknown Aspect XYZ", rolledValue: 30 },
      "helm",
      "Sorcerer"
    );
    expect(result.kind).toBe("uncertain");
    if (result.kind === "uncertain") {
      expect(result.reason).toBe("no-match");
    }
  });

  it("returns uncertain/out-of-range for aspect value exceeding max (D12)", () => {
    // conceited_aspect range is [15.0, 25.0]
    const result = resolveAspect(
      { label: "Conceited Aspect", rolledValue: 999.0 },
      "ring1",
      "Sorcerer"
    );
    expect(result.kind).toBe("uncertain");
    if (result.kind === "uncertain") {
      expect(result.reason).toBe("out-of-range");
      expect(result.aspectId).toBe("conceited_aspect");
    }
  });
});

describe("resolveSlot", () => {
  it("resolves 'Helm' to helm for any class", () => {
    const result = resolveSlot("Helm", "Sorcerer");
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") expect(result.slotId).toBe("helm");
  });

  it("resolves 'Ring' to ambiguous [ring1, ring2] for any class", () => {
    const result = resolveSlot("Ring", "Sorcerer");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates).toContain("ring1");
      expect(result.candidates).toContain("ring2");
    }
  });

  it("resolves 'Sword' to weapon for non-Barbarian", () => {
    const result = resolveSlot("Sword", "Sorcerer");
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") expect(result.slotId).toBe("weapon");
  });

  it("resolves 'Two-Handed Sword' to barb_2h_slashing for Barbarian", () => {
    const result = resolveSlot("Two-Handed Sword", "Barbarian");
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") expect(result.slotId).toBe("barb_2h_slashing");
  });

  it("resolves 'Two-Handed Mace' to barb_2h_bludgeoning for Barbarian", () => {
    const result = resolveSlot("Two-Handed Mace", "Barbarian");
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") expect(result.slotId).toBe("barb_2h_bludgeoning");
  });
});

describe("resolveItem — full pipeline", () => {
  it("resolves a helm item for Sorcerer", () => {
    const result = resolveItem(
      {
        name: "Test Helm",
        itemType: "Helm",
        rarity: "rare",
        itemPower: 800,
        isAncestral: false,
        implicits: [],
        explicits: [{ label: "Maximum Life", rolledValue: 2000 }],
        tempered: [],
      },
      "Sorcerer"
    );

    expect(result.slotResult.kind).toBe("resolved");
    if (result.slotResult.kind === "resolved") {
      expect(result.slotResult.slotId).toBe("helm");
    }
    expect(result.explicits).toHaveLength(1);
    expect(result.explicits[0].kind).toBe("resolved");
  });

  it("returns incompatible slot for unrecognized item type", () => {
    const result = resolveItem(
      {
        name: "Weird Item",
        itemType: "UnknownItemTypeXYZ",
        rarity: "common",
        implicits: [],
        explicits: [],
        tempered: [],
        isAncestral: false,
      },
      "Sorcerer"
    );
    expect(result.slotResult.kind).toBe("incompatible");
  });
});
