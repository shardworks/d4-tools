/**
 * CI gate: datamine-import pipeline correctness against real d4data.
 *
 * The fixture-based tests in `formula-evaluator.test.ts` exercise the loader's
 * legacy `arFormulas` shape. This file exercises the same loader against the
 * **real DiabloTools/d4data shape** (`ptData/tEntries/arRanges`) — both via a
 * small inline fixture that captures the real shape and via a full end-to-end
 * test against a checked-out d4data clone when one is available.
 *
 * The combination of these tests is the structural defense against the
 * "loader works on fixtures but silently fails on real d4data" failure mode
 * that the substrate-repair commit was written to fix.
 *
 * The end-to-end test path:
 *   - Reads `D4DATA_ROOT` env var, falling back to `/workspace/d4data`
 *   - If neither exists, the test skips with a logged reason
 *   - When present, it runs the full formula evaluator against the real
 *     `GearAffix_Slow_Weapon_Damage` table and asserts the IP-850 mean lands
 *     in the Maxroll-published reference range (`125 ± 5%`)
 *
 * If this test fails on CI, the substrate has regressed against real data.
 */

import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  loadFormulas,
  evaluateFormulaBands,
  getBandAtItemPower,
} from "../tools/datamine-import/formulas/index";
import { toBnetFileName } from "../tools/datamine-import/file-name";

const defaultScalars = {
  sacredOffense: 1,
  sacredDefense: 1,
  ancestralOffense: 1,
  ancestralDefense: 1,
};

// ─── Inline real-shape fixture ──────────────────────────────────────────────

/**
 * Writes a minimal `AttributeFormulas.gam.json` in the real d4data shape
 * (`ptData/tEntries/arRanges`) to a tempdir, returning the datamine root path.
 *
 * The fixture captures the exact `GearAffix_Slow_Weapon_Damage` IP bands that
 * the production formula table provides — so we can assert on the same numeric
 * spot check as the full end-to-end test without depending on a real clone.
 */
function writeRealShapeFixture(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "d4-realshape-"));
  const dir = path.join(tmp, "json", "base", "meta", "GameBalance");
  fs.mkdirSync(dir, { recursive: true });

  const realShape = {
    ptData: [
      {
        tEntries: [
          {
            tHeader: { szName: "GearAffix_Slow_Weapon_Damage" },
            arRanges: [
              { nItemPowerRangeStart: 0,   tFormula: { value: "FloatRandomRangeWithInterval(1,10,10)/10" } },
              { nItemPowerRangeStart: 120, tFormula: { value: "FloatRandomRangeWithInterval(15,22,37)/10" } },
              { nItemPowerRangeStart: 200, tFormula: { value: "FloatRandomRangeWithInterval(20,30,50)/10" } },
              { nItemPowerRangeStart: 830, tFormula: { value: "FloatRandomRangeWithInterval(564,844,1408)/10" } },
              { nItemPowerRangeStart: 850, tFormula: { value: "FloatRandomRangeWithInterval(625,938,1563)/10" } },
              { nItemPowerRangeStart: 900, tFormula: { value: "FloatRandomRangeWithInterval(768,1151,1919)/10" } },
            ],
          },
          {
            tHeader: { szName: "GearAffix_SkillRankBonus" },
            arRanges: [
              { nItemPowerRangeStart: 0,   tFormula: { value: "Round(FloatRandomRangeWithInterval(1,1,2)*GetTotalAffixBonus())" } },
              { nItemPowerRangeStart: 750, tFormula: { value: "Round(FloatRandomRangeWithInterval(1,2,3)*GetTotalAffixBonus())" } },
            ],
          },
        ],
      },
    ],
  };

  fs.writeFileSync(
    path.join(dir, "AttributeFormulas.gam.json"),
    JSON.stringify(realShape, null, 2),
    "utf8"
  );

  return tmp;
}

// ─── Tests against the inline real-shape fixture ─────────────────────────────

describe("loadFormulas — real d4data shape (ptData/tEntries/arRanges)", () => {
  it("parses the ptData/tEntries structure", () => {
    const root = writeRealShapeFixture();
    try {
      const formulas = loadFormulas(root);
      expect(formulas.size).toBe(2);
      expect(formulas.has("GearAffix_Slow_Weapon_Damage")).toBe(true);
      expect(formulas.has("GearAffix_SkillRankBonus")).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("evaluates GearAffix_Slow_Weapon_Damage at IP 850 to mean ≈ 125 (Maxroll-published reference)", () => {
    const root = writeRealShapeFixture();
    try {
      const formulas = loadFormulas(root);
      const rec = formulas.get("GearAffix_Slow_Weapon_Damage")!;
      const bands = evaluateFormulaBands(rec, defaultScalars, false);
      const band = getBandAtItemPower(bands, 850);
      expect(band).toBeDefined();
      expect(band!.min).toBeCloseTo(93.8, 1);
      expect(band!.max).toBeCloseTo(156.3, 1);
      const mean = (band!.min + band!.max) / 2;
      // ±5% of the Maxroll-published mean (125.05)
      expect(mean).toBeGreaterThan(118);
      expect(mean).toBeLessThan(132);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("evaluates GearAffix_SkillRankBonus (containing GetTotalAffixBonus()) without throwing", () => {
    const root = writeRealShapeFixture();
    try {
      const formulas = loadFormulas(root);
      const rec = formulas.get("GearAffix_SkillRankBonus")!;
      // Should NOT throw — GetTotalAffixBonus() returns 1.0 catalog-time identity.
      const bands = evaluateFormulaBands(rec, defaultScalars, false);
      expect(bands.length).toBeGreaterThan(0);
      // At IP 0: FloatRandomRangeWithInterval(step=1, min=1, max=2) * 1 → [1, 2]
      const b0 = bands.find((b) => b.minItemPower === 0)!;
      expect(b0.min).toBe(1);
      expect(b0.max).toBe(2);
      // At IP 750: Round(FloatRandomRangeWithInterval(step=1, min=2, max=3) * 1) → [2, 3]
      const b750 = bands.find((b) => b.minItemPower === 750)!;
      expect(b750.min).toBe(2);
      expect(b750.max).toBe(3);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── toBnetFileName ──────────────────────────────────────────────────────────

describe("toBnetFileName", () => {
  it("strips base/meta/Affix/ prefix and .aff extension", () => {
    expect(toBnetFileName("base/meta/Affix/X2_Slow_Weapon_Damage_2HMace.aff"))
      .toBe("X2_Slow_Weapon_Damage_2HMace");
  });

  it("strips base/meta/ParagonBoard/ prefix and .pbd extension", () => {
    expect(toBnetFileName("base/meta/ParagonBoard/Paragon_Barb_00.pbd"))
      .toBe("Paragon_Barb_00");
  });

  it("strips base/meta/Aspect/ prefix and .asp extension", () => {
    expect(toBnetFileName("base/meta/Aspect/Asp_Legendary_Barb_001.asp"))
      .toBe("Asp_Legendary_Barb_001");
  });

  it("is idempotent — applying twice has the same effect as once", () => {
    const inputs = [
      "base/meta/Affix/X2_Slow_Weapon_Damage_2HMace.aff",
      "X2_Slow_Weapon_Damage_2HMace",
      "Already_Basename_Form",
    ];
    for (const input of inputs) {
      const once = toBnetFileName(input);
      const twice = toBnetFileName(once);
      expect(twice).toBe(once);
    }
  });

  it("passes through already-normalized basenames unchanged", () => {
    expect(toBnetFileName("X2_Slow_Weapon_Damage_2HMace"))
      .toBe("X2_Slow_Weapon_Damage_2HMace");
  });
});

// ─── End-to-end against a real d4data clone (skipped if absent) ──────────────

function findRealDatamine(): string | null {
  const envPath = process.env.D4DATA_ROOT;
  if (envPath && fs.existsSync(envPath)) return envPath;
  const fallback = "/workspace/d4data";
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

describe("datamine-import — end-to-end against real d4data (CI gate)", () => {
  const root = findRealDatamine();

  if (!root) {
    it.skip("skipped — no real d4data clone available (set D4DATA_ROOT or place clone at /workspace/d4data)", () => {});
    return;
  }

  it(`detects the real ptData shape at ${root}`, () => {
    const formulas = loadFormulas(root);
    expect(formulas.size).toBeGreaterThan(100);
  });

  it("real GearAffix_Slow_Weapon_Damage at IP 850 → mean ≈ 125 (±5% of Maxroll reference)", () => {
    const formulas = loadFormulas(root);
    const rec = formulas.get("GearAffix_Slow_Weapon_Damage");
    expect(rec).toBeDefined();

    const bands = evaluateFormulaBands(rec!, defaultScalars, false);
    const band = getBandAtItemPower(bands, 850);
    expect(band).toBeDefined();

    const mean = (band!.min + band!.max) / 2;
    // Maxroll's published formula at IP 850 evaluates to mean 125.05.
    // The d4data table is the source-of-truth for both sides; these MUST agree
    // within evaluation precision (±5% is generous).
    expect(mean).toBeGreaterThan(118);
    expect(mean).toBeLessThan(132);
  });

  it("real GearAffix_Slow_Weapon_Damage produces at least 10 IP bands", () => {
    // Sanity: the loader is reading the full IP-band table, not just one entry.
    const formulas = loadFormulas(root);
    const rec = formulas.get("GearAffix_Slow_Weapon_Damage")!;
    expect(rec.arAffixScalings.length).toBeGreaterThanOrEqual(10);
  });

  it("real GearAffix_SkillRankBonus evaluates (GetTotalAffixBonus catalog-identity is wired)", () => {
    const formulas = loadFormulas(root);
    const rec = formulas.get("GearAffix_SkillRankBonus");
    expect(rec).toBeDefined();
    // Should NOT throw — the function was previously on UNSUPPORTED_PREFIXES,
    // which made every SkillRankBonus affix fail the formula gate.
    expect(() => evaluateFormulaBands(rec!, defaultScalars, false)).not.toThrow();
  });
});
