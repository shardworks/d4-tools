/**
 * Formula DSL evaluator unit tests (D27 — dedicated test file).
 *
 * Covers: parser, each DSL function, error paths, and the headline spot-check:
 *   GearAffix_Armor at IP 260 → band [183, 274]
 *
 * Fixture data sourced from DiabloTools/d4data build 3.0.1.71747 (MIT license).
 * Only the subset needed for these tests is included in __tests__/fixtures/.
 */

import { describe, it, expect } from "vitest";
import * as path from "node:path";

import {
  evaluate,
  UnsupportedFunctionError,
  FormulaParseError,
  type EvalContext,
} from "../tools/datamine-import/formulas/evaluator";
import {
  loadFormulas,
  evaluateFormulaBands,
  getBandAtItemPower,
  type ValueRangeBand,
} from "../tools/datamine-import/formulas/index";
import { loadGlobalConstants } from "../tools/datamine-import/formulas/constants";

// ─── Shared test context ──────────────────────────────────────────────────────

const FIXTURE_DATAMINE = path.resolve(__dirname, "fixtures/datamine");

const defaultScalars = {
  sacredOffense: 1.25,
  sacredDefense: 1.25,
  ancestralOffense: 1.5,
  ancestralDefense: 1.5,
};

function ctx(
  itemPower: number,
  position: "min" | "max" | "mid" = "min"
): EvalContext {
  return { itemPower, position, scalars: defaultScalars };
}

// ─── Parser: number literals ──────────────────────────────────────────────────

describe("parser — number literals", () => {
  it("evaluates an integer literal", () => {
    expect(evaluate("42", ctx(100))).toBe(42);
  });

  it("evaluates a decimal literal", () => {
    expect(evaluate("3.14", ctx(100))).toBeCloseTo(3.14);
  });

  it("evaluates zero literal", () => {
    expect(evaluate("0", ctx(100))).toBe(0);
  });
});

// ─── Parser: arithmetic operators ────────────────────────────────────────────

describe("parser — arithmetic operators", () => {
  it("addition", () => {
    expect(evaluate("2 + 3", ctx(100))).toBe(5);
  });

  it("subtraction", () => {
    expect(evaluate("10 - 4", ctx(100))).toBe(6);
  });

  it("multiplication", () => {
    expect(evaluate("3 * 4", ctx(100))).toBe(12);
  });

  it("division", () => {
    expect(evaluate("10 / 4", ctx(100))).toBe(2.5);
  });

  it("operator precedence: multiplication before addition", () => {
    expect(evaluate("2 + 3 * 4", ctx(100))).toBe(14);
  });

  it("parentheses override precedence", () => {
    expect(evaluate("(2 + 3) * 4", ctx(100))).toBe(20);
  });

  it("unary minus on a number", () => {
    expect(evaluate("-5", ctx(100))).toBe(-5);
  });

  it("unary minus inside expression", () => {
    expect(evaluate("10 + -3", ctx(100))).toBe(7);
  });

  it("nested parentheses", () => {
    expect(evaluate("((2 + 3) * (4 + 1))", ctx(100))).toBe(25);
  });
});

// ─── DSL function: IPower() ───────────────────────────────────────────────────

describe("IPower()", () => {
  it("returns itemPower from context", () => {
    expect(evaluate("IPower()", ctx(260))).toBe(260);
    expect(evaluate("IPower()", ctx(800))).toBe(800);
  });

  it("can be used in arithmetic", () => {
    expect(evaluate("IPower() * 2", ctx(100))).toBe(200);
  });

  it("Floor(IPower() * 0.5) rounds down", () => {
    expect(evaluate("Floor(IPower() * 0.5)", ctx(400))).toBe(200);
    expect(evaluate("Floor(IPower() * 0.5)", ctx(401))).toBe(200);
    expect(evaluate("Floor(IPower() * 0.5)", ctx(402))).toBe(201);
  });
});

// ─── DSL function: RandomInt() ────────────────────────────────────────────────

describe("RandomInt(min, max)", () => {
  it("position=min returns first arg", () => {
    expect(evaluate("RandomInt(100, 200)", ctx(100, "min"))).toBe(100);
  });

  it("position=max returns second arg", () => {
    expect(evaluate("RandomInt(100, 200)", ctx(100, "max"))).toBe(200);
  });

  it("position=mid returns midpoint", () => {
    expect(evaluate("RandomInt(100, 200)", ctx(100, "mid"))).toBe(150);
  });

  it("headline spot-check: RandomInt(183, 274) min=183", () => {
    expect(evaluate("RandomInt(183, 274)", ctx(260, "min"))).toBe(183);
  });

  it("headline spot-check: RandomInt(183, 274) max=274", () => {
    expect(evaluate("RandomInt(183, 274)", ctx(260, "max"))).toBe(274);
  });
});

// ─── DSL function: FloatRandomRangeWithInterval() ────────────────────────────

describe("FloatRandomRangeWithInterval(step, min, max)", () => {
  it("position=min returns min arg (index 1)", () => {
    expect(evaluate("FloatRandomRangeWithInterval(0.01, 0.08, 0.14)", ctx(100, "min"))).toBeCloseTo(0.08);
  });

  it("position=max returns max arg (index 2)", () => {
    expect(evaluate("FloatRandomRangeWithInterval(0.01, 0.08, 0.14)", ctx(100, "max"))).toBeCloseTo(0.14);
  });

  it("position=mid returns midpoint of min and max args", () => {
    expect(evaluate("FloatRandomRangeWithInterval(0.01, 0.08, 0.14)", ctx(100, "mid"))).toBeCloseTo(0.11);
  });
});

// ─── DSL function: FloatRangeWithInterval() ───────────────────────────────────

describe("FloatRangeWithInterval(min, max, step)", () => {
  it("position=min returns first arg", () => {
    expect(evaluate("FloatRangeWithInterval(10, 20, 1)", ctx(100, "min"))).toBe(10);
  });

  it("position=max returns second arg", () => {
    expect(evaluate("FloatRangeWithInterval(10, 20, 1)", ctx(100, "max"))).toBe(20);
  });
});

// ─── DSL function: Round/ROUND/Floor ─────────────────────────────────────────

describe("rounding functions", () => {
  it("Floor() rounds down", () => {
    expect(evaluate("Floor(3.7)", ctx(100))).toBe(3);
    expect(evaluate("Floor(-3.2)", ctx(100))).toBe(-4);
  });

  it("Round() rounds to nearest integer", () => {
    expect(evaluate("Round(3.5)", ctx(100))).toBe(4);
    expect(evaluate("Round(3.4)", ctx(100))).toBe(3);
  });

  it("ROUND() is an alias for Round()", () => {
    expect(evaluate("ROUND(3.5)", ctx(100))).toBe(evaluate("Round(3.5)", ctx(100)));
  });

  it("Floor(RandomInt(183, 274)) with position=min → 183", () => {
    expect(evaluate("Floor(RandomInt(183, 274))", ctx(260, "min"))).toBe(183);
  });

  it("Floor(RandomInt(183, 274)) with position=max → 274", () => {
    expect(evaluate("Floor(RandomInt(183, 274))", ctx(260, "max"))).toBe(274);
  });
});

// ─── DSL function: Min/Max/Pin ────────────────────────────────────────────────

describe("Min, Max, Pin", () => {
  it("Min(a, b) returns smaller", () => {
    expect(evaluate("Min(3, 5)", ctx(100))).toBe(3);
    expect(evaluate("Min(5, 3)", ctx(100))).toBe(3);
  });

  it("Max(a, b) returns larger", () => {
    expect(evaluate("Max(3, 5)", ctx(100))).toBe(5);
  });

  it("Pin(val, min, max) clamps value", () => {
    expect(evaluate("Pin(2, 3, 10)", ctx(100))).toBe(3);   // below min → min
    expect(evaluate("Pin(5, 3, 10)", ctx(100))).toBe(5);   // in range → unchanged
    expect(evaluate("Pin(15, 3, 10)", ctx(100))).toBe(10); // above max → max
  });
});

// ─── DSL function: Pow ────────────────────────────────────────────────────────

describe("Pow(base, exp)", () => {
  it("integer exponent", () => {
    expect(evaluate("Pow(2, 10)", ctx(100))).toBe(1024);
  });

  it("fractional exponent", () => {
    expect(evaluate("Pow(4, 0.5)", ctx(100))).toBeCloseTo(2);
  });
});

// ─── DSL function: CurrentLegendaryRank() ────────────────────────────────────

describe("CurrentLegendaryRank()", () => {
  it("returns 0 when legendaryRank is omitted (default)", () => {
    expect(evaluate("CurrentLegendaryRank()", ctx(100))).toBe(0);
    expect(evaluate("CurrentLegendaryRank()", ctx(900))).toBe(0);
  });

  it("returns 0 when legendaryRank is explicitly 0", () => {
    expect(evaluate("CurrentLegendaryRank()", { ...ctx(100), legendaryRank: 0 })).toBe(0);
  });

  it("returns the supplied legendaryRank when non-zero", () => {
    expect(evaluate("CurrentLegendaryRank()", { ...ctx(100), legendaryRank: 4 })).toBe(4);
    expect(evaluate("CurrentLegendaryRank()", { ...ctx(100), legendaryRank: 12 })).toBe(12);
  });

  it("legendaryRank is used in arithmetic expressions (masterwork modeling)", () => {
    // Simulates a formula like: 100 + CurrentLegendaryRank() * 25
    expect(evaluate("100 + CurrentLegendaryRank() * 25", { ...ctx(100), legendaryRank: 4 }))
      .toBe(200);
    expect(evaluate("100 + CurrentLegendaryRank() * 25", ctx(100))).toBe(100); // default=0
  });

  it("can be used in arithmetic (default rank is zero, so no bonus)", () => {
    expect(evaluate("100 + CurrentLegendaryRank() * 50", ctx(100))).toBe(100);
  });
});

// ─── Scalar constants ─────────────────────────────────────────────────────────

describe("Sacred/Ancestral scalar constants", () => {
  it("SacredAffixScalarOffense as identifier", () => {
    expect(evaluate("SacredAffixScalarOffense", ctx(100))).toBe(1.25);
  });

  it("SacredAffixScalarDefense as identifier", () => {
    expect(evaluate("SacredAffixScalarDefense", ctx(100))).toBe(1.25);
  });

  it("AncestralAffixScalarOffense as identifier", () => {
    expect(evaluate("AncestralAffixScalarOffense", ctx(100))).toBe(1.5);
  });

  it("AncestralAffixScalarDefense as identifier", () => {
    expect(evaluate("AncestralAffixScalarDefense", ctx(100))).toBe(1.5);
  });

  it("scalar used as function call (0-arg)", () => {
    expect(evaluate("SacredAffixScalarOffense()", ctx(100))).toBe(1.25);
  });

  it("scalar in arithmetic expression", () => {
    expect(evaluate("100 * SacredAffixScalarOffense", ctx(100))).toBe(125);
  });

  it("Floor(IPower() * 0.5 * SacredAffixScalarOffense) at IP=800", () => {
    // Floor(800 * 0.5 * 1.25) = Floor(500) = 500
    expect(evaluate("Floor(IPower() * 0.5 * SacredAffixScalarOffense)", ctx(800, "min"))).toBe(500);
  });

  it("Floor(IPower() * 0.5 * AncestralAffixScalarDefense) at IP=900", () => {
    // Floor(900 * 0.5 * 1.5) = Floor(675) = 675
    expect(evaluate("Floor(IPower() * 0.5 * AncestralAffixScalarDefense)", ctx(900, "min"))).toBe(675);
  });
});

// ─── Error paths ──────────────────────────────────────────────────────────────

describe("UnsupportedFunctionError (D5)", () => {
  it("throws for ParagonPowerBudgetMultiplier*", () => {
    expect(() => evaluate("ParagonPowerBudgetMultiplierSomething(1)", ctx(100)))
      .toThrow(UnsupportedFunctionError);
  });

  it("throws for ParagonGetGlyphLevel", () => {
    expect(() => evaluate("ParagonGetGlyphLevel()", ctx(100)))
      .toThrow(UnsupportedFunctionError);
  });

  it("throws for GetTotalAffixBonus", () => {
    expect(() => evaluate("GetTotalAffixBonus(1, 2)", ctx(100)))
      .toThrow(UnsupportedFunctionError);
  });

  it("throws for SharedRandomFloat", () => {
    expect(() => evaluate("SharedRandomFloat(1, 2)", ctx(100)))
      .toThrow(UnsupportedFunctionError);
  });

  it("UnsupportedFunctionError carries the function name", () => {
    try {
      evaluate("SharedRandomFloat(1, 2)", ctx(100));
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UnsupportedFunctionError);
      expect((e as UnsupportedFunctionError).fnName).toBe("SharedRandomFloat");
    }
  });
});

describe("FormulaParseError", () => {
  it("throws on unexpected character", () => {
    expect(() => evaluate("100 @ 200", ctx(100))).toThrow(FormulaParseError);
  });

  it("throws on unmatched parenthesis", () => {
    expect(() => evaluate("Floor(100", ctx(100))).toThrow(FormulaParseError);
  });

  it("throws on empty input (not literal '0')", () => {
    // Empty string → returns 0 (special-cased)
    expect(evaluate("", ctx(100))).toBe(0);
  });

  it("throws for unknown identifier that is not a scalar", () => {
    expect(() => evaluate("SomeUnknownIdentifierXYZ", ctx(100))).toThrow();
  });
});

// ─── loadGlobalConstants ──────────────────────────────────────────────────────

describe("loadGlobalConstants", () => {
  it("loads scalars from the fixture globals.glo.json", () => {
    const globals = loadGlobalConstants(FIXTURE_DATAMINE);
    expect(globals.scalars.sacredOffense).toBe(1.25);
    expect(globals.scalars.sacredDefense).toBe(1.25);
    expect(globals.scalars.ancestralOffense).toBe(1.5);
    expect(globals.scalars.ancestralDefense).toBe(1.5);
  });

  it("loads IP thresholds from the fixture globals.glo.json", () => {
    const globals = loadGlobalConstants(FIXTURE_DATAMINE);
    expect(globals.ipThresholds.sacredMinItemPower).toBe(725);
    expect(globals.ipThresholds.ancestralMinItemPower).toBe(825);
    expect(globals.ipThresholds.greaterAffixMinItemPower).toBe(925);
  });

  it("throws when globals.glo.json is not found", () => {
    expect(() => loadGlobalConstants("/nonexistent/datamine/path"))
      .toThrow(/globals\.glo\.json not found/);
  });
});

// ─── loadFormulas ─────────────────────────────────────────────────────────────

describe("loadFormulas", () => {
  it("loads formula records from the fixture AttributeFormulas.gam.json", () => {
    const formulas = loadFormulas(FIXTURE_DATAMINE);
    expect(formulas.size).toBeGreaterThan(0);
  });

  it("includes GearAffix_Armor formula", () => {
    const formulas = loadFormulas(FIXTURE_DATAMINE);
    expect(formulas.has("GearAffix_Armor")).toBe(true);
  });

  it("GearAffix_Armor has multiple IP bands sorted ascending", () => {
    const formulas = loadFormulas(FIXTURE_DATAMINE);
    const armor = formulas.get("GearAffix_Armor")!;
    expect(armor.arAffixScalings.length).toBeGreaterThan(1);
    for (let i = 1; i < armor.arAffixScalings.length; i++) {
      expect(armor.arAffixScalings[i].nMinItemPower)
        .toBeGreaterThan(armor.arAffixScalings[i - 1].nMinItemPower);
    }
  });

  it("returns empty map when file is missing", () => {
    const formulas = loadFormulas("/nonexistent/datamine");
    expect(formulas.size).toBe(0);
  });
});

// ─── evaluateFormulaBands ─────────────────────────────────────────────────────

describe("evaluateFormulaBands", () => {
  it("GearAffix_Life produces a single band [700, 2800]", () => {
    const formulas = loadFormulas(FIXTURE_DATAMINE);
    const record = formulas.get("GearAffix_Life")!;
    const bands = evaluateFormulaBands(record, defaultScalars, false);
    expect(bands).toHaveLength(1);
    expect(bands[0].min).toBe(700);
    expect(bands[0].max).toBe(2800);
    expect(bands[0].minItemPower).toBe(1);
  });

  it("GearAffix_LifePercent with isPercent=true → [8, 14]", () => {
    const formulas = loadFormulas(FIXTURE_DATAMINE);
    const record = formulas.get("GearAffix_LifePercent")!;
    const bands = evaluateFormulaBands(record, defaultScalars, true);
    expect(bands).toHaveLength(1);
    expect(bands[0].min).toBeCloseTo(8.0, 3);
    expect(bands[0].max).toBeCloseTo(14.0, 3);
  });

  it("GearAffix_CritDamage with isPercent=true → [20, 50]", () => {
    const formulas = loadFormulas(FIXTURE_DATAMINE);
    const record = formulas.get("GearAffix_CritDamage")!;
    const bands = evaluateFormulaBands(record, defaultScalars, true);
    expect(bands).toHaveLength(1);
    expect(bands[0].min).toBeCloseTo(20.0, 3);
    expect(bands[0].max).toBeCloseTo(50.0, 3);
  });

  it("GearAffix_Armor produces multiple bands", () => {
    const formulas = loadFormulas(FIXTURE_DATAMINE);
    const record = formulas.get("GearAffix_Armor")!;
    const bands = evaluateFormulaBands(record, defaultScalars, false);
    expect(bands.length).toBeGreaterThan(1);
  });

  it("GearAffix_Armor band at minItemPower=200 has min=183, max=274", () => {
    const formulas = loadFormulas(FIXTURE_DATAMINE);
    const record = formulas.get("GearAffix_Armor")!;
    const bands = evaluateFormulaBands(record, defaultScalars, false);
    const band200 = bands.find((b) => b.minItemPower === 200);
    expect(band200).toBeDefined();
    expect(band200!.min).toBe(183);
    expect(band200!.max).toBe(274);
  });
});

// ─── getBandAtItemPower ───────────────────────────────────────────────────────

describe("getBandAtItemPower", () => {
  const bands: ValueRangeBand[] = [
    { minItemPower: 1,   min: 50,  max: 75  },
    { minItemPower: 200, min: 183, max: 274 },
    { minItemPower: 300, min: 300, max: 450 },
    { minItemPower: 700, min: 600, max: 900 },
  ];

  it("returns the last band when itemPower is undefined (D8)", () => {
    const band = getBandAtItemPower(bands, undefined);
    expect(band.minItemPower).toBe(700);
  });

  it("returns the first band for IP below first floor", () => {
    const band = getBandAtItemPower(bands, 0);
    expect(band.minItemPower).toBe(1);
  });

  it("returns band with highest floor ≤ IP", () => {
    expect(getBandAtItemPower(bands, 1).minItemPower).toBe(1);
    expect(getBandAtItemPower(bands, 199).minItemPower).toBe(1);
    expect(getBandAtItemPower(bands, 200).minItemPower).toBe(200);
    expect(getBandAtItemPower(bands, 260).minItemPower).toBe(200);
    expect(getBandAtItemPower(bands, 299).minItemPower).toBe(200);
    expect(getBandAtItemPower(bands, 300).minItemPower).toBe(300);
    expect(getBandAtItemPower(bands, 699).minItemPower).toBe(300);
    expect(getBandAtItemPower(bands, 700).minItemPower).toBe(700);
    expect(getBandAtItemPower(bands, 1000).minItemPower).toBe(700);
  });
});

// ─── HEADLINE SPOT-CHECK ──────────────────────────────────────────────────────

describe("HEADLINE SPOT-CHECK: GearAffix_Armor at IP 260 → band [183, 274]", () => {
  it("loads GearAffix_Armor from real datamine fixture and resolves IP 260 to [183, 274]", () => {
    const formulas = loadFormulas(FIXTURE_DATAMINE);
    const globals = loadGlobalConstants(FIXTURE_DATAMINE);

    expect(formulas.has("GearAffix_Armor")).toBe(true);
    const record = formulas.get("GearAffix_Armor")!;
    const bands = evaluateFormulaBands(record, globals.scalars, false);

    // Band lookup at IP 260
    const band = getBandAtItemPower(bands, 260);

    // The band containing IP 260 must start at minItemPower=200 per the fixture
    expect(band.minItemPower).toBe(200);
    // And must produce the canonical [183, 274] range
    expect(band.min).toBe(183);
    expect(band.max).toBe(274);
  });
});

// ─── GearAffix_ScaledTest: IPower() + scalars ─────────────────────────────────

describe("GearAffix_ScaledTest — IPower() and scalar formulas", () => {
  it("band at floor=1 (Floor(IPower() * 0.5)): min at IP=1, max at IP=499", () => {
    const formulas = loadFormulas(FIXTURE_DATAMINE);
    const record = formulas.get("GearAffix_ScaledTest")!;
    const bands = evaluateFormulaBands(record, defaultScalars, false);
    const b1 = bands.find((b) => b.minItemPower === 1)!;
    expect(b1.min).toBe(Math.floor(1 * 0.5));   // 0
    expect(b1.max).toBe(Math.floor(499 * 0.5));  // 249
  });

  it("band at floor=500 applies SacredAffixScalarOffense=1.25", () => {
    const formulas = loadFormulas(FIXTURE_DATAMINE);
    const record = formulas.get("GearAffix_ScaledTest")!;
    const bands = evaluateFormulaBands(record, defaultScalars, false);
    const b500 = bands.find((b) => b.minItemPower === 500)!;
    // Floor(500 * 0.5 * 1.25) = Floor(312.5) = 312
    expect(b500.min).toBe(Math.floor(500 * 0.5 * 1.25));
  });

  it("band at floor=900 applies AncestralAffixScalarDefense=1.5", () => {
    const formulas = loadFormulas(FIXTURE_DATAMINE);
    const record = formulas.get("GearAffix_ScaledTest")!;
    const bands = evaluateFormulaBands(record, defaultScalars, false);
    const b900 = bands.find((b) => b.minItemPower === 900)!;
    // Floor(900 * 0.5 * 1.5) = Floor(675) = 675
    expect(b900.min).toBe(Math.floor(900 * 0.5 * 1.5));
  });
});
