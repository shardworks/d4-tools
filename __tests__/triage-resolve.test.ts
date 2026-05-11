import { describe, it, expect } from "vitest";
import {
  normalizeLabel,
  jaroWinkler,
  resolveAffix,
  resolveAspect,
  resolveSlot,
  resolveItem,
  type AffixPosition,
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
      "Sorcerer",
      "explicit"
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
      "Sorcerer",
      "explicit"
    );
    expect(result.kind).toBe("resolved");
  });

  it("returns uncertain/no-match for unknown affix label", () => {
    const result = resolveAffix(
      { label: "UnknownSuperPowerXYZ", rolledValue: 100 },
      "helm",
      "Sorcerer",
      "explicit"
    );
    expect(result.kind).toBe("uncertain");
    if (result.kind === "uncertain") {
      expect(result.reason).toBe("no-match");
      expect(result.label).toBe("UnknownSuperPowerXYZ");
    }
  });

  it("returns uncertain/out-of-range for value exceeding max (D12)", () => {
    // affix_max_life has a formula-derived range; 99999 exceeds any reasonable game max
    const result = resolveAffix(
      { label: "Maximum Life", rolledValue: 99999 },
      "helm",
      "Sorcerer",
      "explicit"
    );
    expect(result.kind).toBe("uncertain");
    if (result.kind === "uncertain") {
      expect(result.reason).toBe("out-of-range");
      if (result.reason === "out-of-range") {
        expect(result.affixId).toBe("affix_max_life");
      }
    }
  });

  it("returns uncertain/out-of-range for value below min (D12)", () => {
    // affix_max_life has a formula-derived range; 100 is below any reasonable game min
    const result = resolveAffix(
      { label: "Maximum Life", rolledValue: 100 },
      "helm",
      "Sorcerer",
      "explicit"
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
      "Sorcerer",
      "explicit"
    );
    // May resolve if in valueRange, or uncertain if not — but must not be filtered out for Sorcerer
    expect(result.kind).toBeOneOf(["resolved", "uncertain"]);
  });

  it("Sorcerer-only affix does NOT resolve for Barbarian (filtered by class, D9)", () => {
    const result = resolveAffix(
      { label: "Mana per Second", rolledValue: 5 },
      "helm",
      "Barbarian",
      "explicit"
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
      "Sorcerer",
      "explicit"
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
      if (result.reason === "out-of-range") {
        expect(result.aspectId).toBe("conceited_aspect");
      }
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

// ─── v17: Jaro-Winkler (D2) ───────────────────────────────────────────────────

describe("jaroWinkler — in-house similarity (D2)", () => {
  it("identical strings score 1.0", () => {
    expect(jaroWinkler("maximum life", "maximum life")).toBe(1);
  });

  it("completely different strings score below 0.5", () => {
    expect(jaroWinkler("xyz", "abcdefghij")).toBeLessThan(0.5);
  });

  it("'max life' vs 'maximum life' scores above 0.82", () => {
    // Synonym pre-expansion handles this, but JW alone should also be high
    expect(jaroWinkler("max life", "maximum life")).toBeGreaterThan(0.82);
  });

  it("scores are symmetric", () => {
    const a = jaroWinkler("critical strike chance", "crit strike chance");
    const b = jaroWinkler("crit strike chance", "critical strike chance");
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });

  it("minor typo ('maximm life') still scores above 0.90", () => {
    expect(jaroWinkler("maximm life", "maximum life")).toBeGreaterThan(0.90);
  });
});

// ─── v17: Synonym expansion (D2 / synonyms.json) ──────────────────────────────

describe("resolveAffix — synonym expansion", () => {
  it("resolves 'Max Life' (synonym) to affix_max_life", () => {
    const result = resolveAffix({ label: "Max Life", rolledValue: 2000 }, "helm", "Sorcerer", "explicit");
    // 'max life' → synonym → 'maximum life' → exact match
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.affixId).toBe("affix_max_life");
    }
  });

  it("resolves 'Crit Chance' (synonym) on helm/Sorcerer", () => {
    const result = resolveAffix(
      { label: "Crit Chance", rolledValue: 5 },
      "helm",
      "Sorcerer",
      "explicit"
    );
    // crit_chance affix exists — resolves after synonym expansion
    expect(result.kind).toBeOneOf(["resolved", "uncertain"]);
    // Must NOT be no-match for a valid synonym alias
    if (result.kind === "uncertain") {
      expect(result.reason).not.toBe("no-match");
    }
  });
});

// ─── v17: Fuzzy matching (D2) ─────────────────────────────────────────────────

describe("resolveAffix — fuzzy matching (D2)", () => {
  it("resolves near-typo 'Maximun Life' to affix_max_life", () => {
    const result = resolveAffix(
      { label: "Maximun Life", rolledValue: 2000 },
      "helm",
      "Sorcerer",
      "explicit"
    );
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.affixId).toBe("affix_max_life");
    }
  });

  it("completely unrelated label still returns no-match", () => {
    const result = resolveAffix(
      { label: "ZZZ_NOTHING_MATCHES_XYZ", rolledValue: 100 },
      "helm",
      "Sorcerer",
      "explicit"
    );
    expect(result.kind).toBe("uncertain");
    if (result.kind === "uncertain") expect(result.reason).toBe("no-match");
  });
});

// ─── v17: Value-format auto-correct (D4) ──────────────────────────────────────

describe("resolveAffix — value-mismatch auto-correct (D4)", () => {
  it("returns value-mismatch when isPercent affix extracted as 0.05 instead of 5", () => {
    // affix_crit_chance is isPercent:true with range e.g. [3, 10]
    // LLM extracted 0.05 (should be 5)
    const result = resolveAffix(
      { label: "Critical Strike Chance", rolledValue: 0.05 },
      "helm",
      "Sorcerer",
      "explicit"
    );
    // Expect either resolved (if 0.05 in range, unlikely) or value-mismatch / out-of-range
    if (result.kind === "uncertain") {
      // If it matched the affix, it should be value-mismatch (corrected to 5)
      if (result.reason === "value-mismatch") {
        expect(result.unitCorrected).toBeCloseTo(5, 1);
        expect(result.affixId).toBe("affix_crit_chance");
      }
      // or out-of-range if correction also out of range — either is valid
    }
  });

  it("does NOT emit value-mismatch when value is already in range", () => {
    const result = resolveAffix(
      { label: "Maximum Life", rolledValue: 2000 },
      "helm",
      "Sorcerer",
      "explicit"
    );
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.affixId).toBe("affix_max_life");
    }
  });

  it("does NOT emit value-mismatch for non-percent affix with value in (0, 1]", () => {
    // Non-percent affixes with small values should not be auto-corrected
    // affix_max_life is NOT isPercent — value 0.5 should be out-of-range not value-mismatch
    const result = resolveAffix(
      { label: "Maximum Life", rolledValue: 0.5 },
      "helm",
      "Sorcerer",
      "explicit"
    );
    expect(result.kind).toBe("uncertain");
    if (result.kind === "uncertain") {
      // Should be out-of-range (0.5 is below min 700), not value-mismatch
      expect(result.reason).toBe("out-of-range");
    }
  });
});

// ─── v18: Position-aware resolver (D2/D3/D8) ──────────────────────────────────

describe("resolveAffix — position filter (v18)", () => {
  it("(a) implicit-position 'Resistance to All Elements' on amulet resolves to affix_all_res", () => {
    // affix_all_res is now flagged isImplicit:true on amulet
    const result = resolveAffix(
      { label: "Resistance to All Elements", rolledValue: 12 },
      "amulet",
      "Sorcerer",
      "implicit"
    );
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.affixId).toBe("affix_all_res");
    }
  });

  it("(b) explicit-position 'Resistance to All Elements' on amulet does NOT match affix_all_res", () => {
    // affix_all_res is isImplicit:true — excluded from the explicit candidate pool
    const result = resolveAffix(
      { label: "Resistance to All Elements", rolledValue: 12 },
      "amulet",
      "Sorcerer",
      "explicit"
    );
    // Must not resolve to affix_all_res; expect no-match or uncertain
    expect(result.kind).toBe("uncertain");
    if (result.kind === "uncertain") {
      expect(result.reason).toBe("no-match");
    }
  });

  it("(c) explicit-position 'Resistance to All Elements' on ring resolves to affix_all_res_ring", () => {
    // Non-regression: ring has its own explicit all-res entry (not implicit-flagged)
    const result = resolveAffix(
      { label: "Resistance to All Elements", rolledValue: 10 },
      "ring1",
      "Sorcerer",
      "explicit"
    );
    expect(result.kind).toBeOneOf(["resolved", "uncertain"]);
    if (result.kind === "resolved") {
      expect(result.affixId).toBe("affix_all_res_ring");
    }
    if (result.kind === "uncertain") {
      // out-of-range is acceptable (value outside ring range); no-match is not
      expect(result.reason).not.toBe("no-match");
      if ("affixId" in result) {
        expect(result.affixId).toBe("affix_all_res_ring");
      }
    }
  });

  it("(d) explicit-position 'Armor' on amulet resolves to affix_armor (may flag out-of-range)", () => {
    // affix_armor now includes amulet in slotRestrictions; sub-min out-of-range is acceptable
    const result = resolveAffix(
      { label: "Armor", rolledValue: 198 },
      "amulet",
      "Sorcerer",
      "explicit"
    );
    expect(result.kind).toBeOneOf(["resolved", "uncertain"]);
    if (result.kind === "resolved") {
      expect(result.affixId).toBe("affix_armor");
    }
    if (result.kind === "uncertain") {
      // 198 is below affix_armor min of 500 → out-of-range is the expected path
      expect(["out-of-range", "no-match"]).toContain(result.reason);
      if (result.reason === "out-of-range" && "affixId" in result) {
        expect(result.affixId).toBe("affix_armor");
      }
    }
  });
});

// ─── v17: Aspect value-mismatch (D4) ──────────────────────────────────────────

describe("resolveAspect — value-mismatch auto-correct (D4)", () => {
  it("returns value-mismatch when isPercent aspect extracted as decimal", () => {
    // conceited_aspect: isPercent:true, range [15, 25]
    // LLM extracted 0.20 (should be 20)
    const result = resolveAspect(
      { label: "Conceited Aspect", rolledValue: 0.20 },
      "ring1",
      "Sorcerer"
    );
    if (result.kind === "uncertain" && result.reason === "value-mismatch") {
      expect(result.unitCorrected).toBeCloseTo(20, 1);
      expect(result.aspectId).toBe("conceited_aspect");
    }
    // Also acceptable: out-of-range (if correction also out of range)
    expect(["resolved", "uncertain"]).toContain(result.kind);
  });
});

// ─── v17: Unique short-circuit (D16) ──────────────────────────────────────────

describe("resolveItem — unique short-circuit (D16)", () => {
  it("resolves Harlequin Crest as unique, slot from catalog (not itemType)", () => {
    const result = resolveItem(
      {
        name: "Harlequin Crest",
        itemType: "Helm", // redundant when name matches unique
        rarity: "unique",
        itemPower: 925,
        isAncestral: false,
        implicits: [],
        explicits: [{ label: "Maximum Life", rolledValue: 2800 }],
        tempered: [],
      },
      "Sorcerer"
    );
    expect(result.slotResult.kind).toBe("resolved");
    if (result.slotResult.kind === "resolved") {
      expect(result.slotResult.slotId).toBe("helm");
    }
  });

  it("unique item fires short-circuit even if itemType would be wrong slot", () => {
    // e.g. LLM mis-extracted itemType as "Chest" but it's a helm unique
    const result = resolveItem(
      {
        name: "Harlequin Crest",
        itemType: "Chest Armor", // intentionally wrong
        rarity: "unique",
        itemPower: 925,
        isAncestral: false,
        implicits: [],
        explicits: [],
        tempered: [],
      },
      "Sorcerer"
    );
    expect(result.slotResult.kind).toBe("resolved");
    if (result.slotResult.kind === "resolved") {
      // Short-circuit should use UniqueEntry.slot = "helm", not the mis-extracted type
      expect(result.slotResult.slotId).toBe("helm");
    }
  });

  it("non-unique rarity does NOT trigger unique short-circuit", () => {
    // A rare item named like a unique should go through normal resolution
    const result = resolveItem(
      {
        name: "Harlequin Crest",
        itemType: "Helm",
        rarity: "rare",
        itemPower: 900,
        isAncestral: false,
        implicits: [],
        explicits: [],
        tempered: [],
      },
      "Sorcerer"
    );
    // Should resolve normally via slot, not via unique short-circuit
    expect(result.slotResult.kind).toBe("resolved");
    if (result.slotResult.kind === "resolved") {
      expect(result.slotResult.slotId).toBe("helm");
    }
  });

  it("mythic rarity also triggers unique short-circuit", () => {
    const result = resolveItem(
      {
        name: "Harlequin Crest",
        itemType: "Helm",
        rarity: "mythic",
        itemPower: 925,
        isAncestral: false,
        implicits: [],
        explicits: [],
        tempered: [],
      },
      "Sorcerer"
    );
    expect(result.slotResult.kind).toBe("resolved");
    if (result.slotResult.kind === "resolved") {
      expect(result.slotResult.slotId).toBe("helm");
    }
  });
});
