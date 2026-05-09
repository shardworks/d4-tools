/**
 * Tests for the damage engine theorycraft config and loader.
 *
 * Covers: upstream defaults, deep-merge override, missing file = defaults,
 * Position A ↔ Position B flip via override (D9), required fields present.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadDamageConfig } from "../lib/damage/config";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string;
let overridePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "d4-damage-config-test-"));
  overridePath = path.join(tmpDir, "damage-config.local.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeOverride(override: Record<string, unknown>) {
  fs.writeFileSync(overridePath, JSON.stringify(override, null, 2), "utf8");
}

// ─── Upstream defaults ────────────────────────────────────────────────────────

describe("loadDamageConfig — upstream defaults", () => {
  it("returns config when no override file exists", () => {
    const cfg = loadDamageConfig(overridePath); // file does not exist yet
    expect(cfg).toBeDefined();
  });

  it("config has attributeToBucket map with required entries", () => {
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.attributeToBucket).toBeDefined();
    expect(cfg.attributeToBucket["Attr_Skill_Damage_Percent"]).toBeDefined();
    expect(cfg.attributeToBucket["Attr_Core_Skill_Damage_Percent"]).toBeDefined();
    expect(cfg.attributeToBucket["Attr_Crit_Strike_Chance_Percent"]).toBeDefined();
    expect(cfg.attributeToBucket["Attr_Crit_Damage_Percent"]).toBeDefined();
    expect(cfg.attributeToBucket["Attr_Attacks_Per_Second_Percent_Bonus"]).toBeDefined();
  });

  it("attributeToBucket entries have bucket and conditional fields", () => {
    const cfg = loadDamageConfig(overridePath);
    for (const [attr, entry] of Object.entries(cfg.attributeToBucket)) {
      if (attr.startsWith("_")) continue; // skip comment keys
      expect(entry.bucket).toBeTruthy();
      expect(entry.conditional).toBeTruthy();
    }
  });

  it("Position A: Attr_Core_Skill_Damage_Percent is in additive bucket", () => {
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.attributeToBucket["Attr_Core_Skill_Damage_Percent"].bucket).toBe("additive");
  });

  it("CC-conditional attributes have conditional: cc", () => {
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.attributeToBucket["Attr_Damage_Percent_Bonus_With_Crowd_Control"]?.conditional).toBe("cc");
    expect(cfg.attributeToBucket["Attr_Vs_Slowed_Chilled_Percent"]?.conditional).toBe("cc");
  });

  it("close/distant conditional attributes have correct conditional values", () => {
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.attributeToBucket["Attr_Close_Damage_Percent_Bonus"]?.conditional).toBe("distance-close");
    expect(cfg.attributeToBucket["Attr_Distant_Damage_Percent_Bonus"]?.conditional).toBe("distance-distant");
  });

  it("vulnerable attribute has conditional: vulnerable", () => {
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.attributeToBucket["Attr_Vuln_Damage_Percent"]?.conditional).toBe("vulnerable");
  });

  it("constants has csBaseline = 0.50 (50% base CSD)", () => {
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.constants.csBaseline).toBeCloseTo(0.50);
  });

  it("constants has vulnerableBaseline = 0.20 (×1.20, D13)", () => {
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.constants.vulnerableBaseline).toBeCloseTo(0.20);
  });

  it("constants has critBaseChance = 0.05 (5%)", () => {
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.constants.critBaseChance).toBeCloseTo(0.05);
  });

  it("uptimes has vulnerable = 0.90 (D10)", () => {
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.uptimes.vulnerable).toBeCloseTo(0.90);
  });

  it("uptimes has cc = 0.0 (boss immune to CC)", () => {
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.uptimes.cc).toBeCloseTo(0.0);
  });

  it("distanceDefault maps Barbarian to close, Sorcerer to distant (D12)", () => {
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.distanceDefault["Barbarian"]).toBe("close");
    expect(cfg.distanceDefault["Sorcerer"]).toBe("distant");
    expect(cfg.distanceDefault["Paladin"]).toBe("close");
    expect(cfg.distanceDefault["Warlock"]).toBe("distant");
  });

  it("primaryStatScalar = 0.001 (D33)", () => {
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.primaryStatScalar).toBeCloseTo(0.001);
  });

  it("classPrimaryStats maps Barbarian to Strength, Rogue to Dexterity", () => {
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.classPrimaryStats["Barbarian"]).toBe("Attr_Strength_Item");
    expect(cfg.classPrimaryStats["Rogue"]).toBe("Attr_Dexterity_Item");
    expect(cfg.classPrimaryStats["Sorcerer"]).toBe("Attr_Intelligence_Item");
    expect(cfg.classPrimaryStats["Druid"]).toBe("Attr_Willpower_Item");
  });

  it("itemPowerFormula has linear type with required fields", () => {
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.itemPowerFormula.type).toBe("linear");
    expect(typeof cfg.itemPowerFormula.slopePerIlvl).toBe("number");
    expect(typeof cfg.itemPowerFormula.baseAtIlvl0).toBe("number");
  });

  it("breakpoints has entries for Barbarian, Sorcerer (no Paladin/Warlock per D34)", () => {
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.breakpoints["Barbarian"]).toBeDefined();
    expect(cfg.breakpoints["Sorcerer"]).toBeDefined();
    expect(cfg.breakpoints["Paladin"]).toBeUndefined();
    expect(cfg.breakpoints["Warlock"]).toBeUndefined();
  });

  it("Barbarian 1h breakpoints are sorted ascending by minMultiplier", () => {
    const cfg = loadDamageConfig(overridePath);
    const tiers = cfg.breakpoints["Barbarian"]["1h"];
    expect(Array.isArray(tiers)).toBe(true);
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].minMultiplier).toBeGreaterThan(tiers[i - 1].minMultiplier);
    }
  });
});

// ─── Override file mechanism ──────────────────────────────────────────────────

describe("loadDamageConfig — local override", () => {
  it("missing override file → returns upstream defaults (no error)", () => {
    // No file written — override path does not exist
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.constants.csBaseline).toBeCloseTo(0.50);
  });

  it("override file changes a constant value", () => {
    writeOverride({ constants: { csBaseline: 0.60 } });
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.constants.csBaseline).toBeCloseTo(0.60);
    // Other constants unchanged
    expect(cfg.constants.vulnerableBaseline).toBeCloseTo(0.20);
  });

  it("override file changes vulnerable uptime", () => {
    writeOverride({ uptimes: { vulnerable: 1.0 } });
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.uptimes.vulnerable).toBeCloseTo(1.0);
    // Other uptimes unchanged
    expect(cfg.uptimes.cc).toBeCloseTo(0.0);
  });

  it("Position A → B flip: override Attr_Core_Skill_Damage_Percent bucket to skill_specific_mult", () => {
    writeOverride({
      attributeToBucket: {
        Attr_Core_Skill_Damage_Percent: {
          bucket: "skill_specific_mult",
          conditional: "unconditional",
        },
      },
    });
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.attributeToBucket["Attr_Core_Skill_Damage_Percent"].bucket).toBe("skill_specific_mult");
    // Other attributes unchanged
    expect(cfg.attributeToBucket["Attr_Skill_Damage_Percent"].bucket).toBe("additive");
  });

  it("deep-merge preserves unoverridden nested keys", () => {
    writeOverride({ constants: { vulnerableBaseline: 0.15 } });
    const cfg = loadDamageConfig(overridePath);
    // Only vulnerableBaseline changed
    expect(cfg.constants.vulnerableBaseline).toBeCloseTo(0.15);
    // csBaseline and critBaseChance are from upstream
    expect(cfg.constants.csBaseline).toBeCloseTo(0.50);
    expect(cfg.constants.critBaseChance).toBeCloseTo(0.05);
  });

  it("override primaryStatScalar to different value", () => {
    writeOverride({ primaryStatScalar: 0.002 });
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.primaryStatScalar).toBeCloseTo(0.002);
  });

  it("invalid JSON in override file → falls back to upstream defaults", () => {
    fs.writeFileSync(overridePath, "{ this is not JSON }", "utf8");
    // Should not throw — falls back silently
    const cfg = loadDamageConfig(overridePath);
    expect(cfg.constants.csBaseline).toBeCloseTo(0.50);
  });
});
