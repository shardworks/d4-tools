/**
 * Behavioral test suite for the datamine import pipeline.
 *
 * Uses the synthetic fixture datamine at __tests__/fixtures/datamine/
 * and writes to temp directories to avoid modifying the real catalog.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runImport } from "../tools/datamine-import/orchestrator";

// ─── Paths ────────────────────────────────────────────────────────────────────

const FIXTURE_DATAMINE = path.resolve(
  __dirname,
  "fixtures/datamine"
);
const FIXTURE_CURATION = path.resolve(
  __dirname,
  "../tools/datamine-import/curation.json"
);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "d4-import-test-"));
}

function makeTempCuration(overrides: {
  affixes?: Record<string, unknown>;
  aspects?: Record<string, unknown>;
  skills?: Record<string, unknown>;
  paragonBoards?: Record<string, unknown>;
  paragonGlyphs?: Record<string, unknown>;
  uniques?: Record<string, unknown>;
}): string {
  const base = JSON.parse(fs.readFileSync(FIXTURE_CURATION, "utf8"));
  const merged = {
    affixes: { ...base.affixes, ...(overrides.affixes ?? {}) },
    aspects: { ...base.aspects, ...(overrides.aspects ?? {}) },
    skills: { ...base.skills, ...(overrides.skills ?? {}) },
    paragonBoards: { ...base.paragonBoards, ...(overrides.paragonBoards ?? {}) },
    paragonGlyphs: { ...base.paragonGlyphs, ...(overrides.paragonGlyphs ?? {}) },
    uniques: { ...base.uniques, ...(overrides.uniques ?? {}) },
  };
  const tmpDir = makeTempDir();
  const filePath = path.join(tmpDir, "curation.json");
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf8");
  return filePath;
}

function runWithTempOutput(
  curationFile: string,
  extraOptions?: Partial<Parameters<typeof runImport>[0]>
): Promise<{ exitCode: number; catalogRoot: string; docsDir: string }> {
  const catalogRoot = makeTempDir();
  const docsDir = makeTempDir();
  return runImport({
    build: "3.0.0.test",
    accessedDate: "2026-05-09",
    datamineRoot: FIXTURE_DATAMINE,
    dryRun: false,
    catalogRoot,
    docsDir,
    curationFile,
    ...extraOptions,
  }).then((result) => ({
    ...result,
    catalogRoot,
    docsDir,
  }));
}

// ─── Case 1: Idempotency ──────────────────────────────────────────────────────

describe("Case 1: Idempotency", () => {
  it("running twice produces the same output", async () => {
    const curationFile = makeTempCuration({});

    // First run
    const run1 = await runWithTempOutput(curationFile);
    const affixesJson1 = fs.readFileSync(
      path.join(run1.catalogRoot, "affixes.json"),
      "utf8"
    );
    const aspectsJson1 = fs.readFileSync(
      path.join(run1.catalogRoot, "aspects.json"),
      "utf8"
    );
    const uniquesJson1 = fs.readFileSync(
      path.join(run1.catalogRoot, "uniques.json"),
      "utf8"
    );

    // Second run (using the same catalogRoot so disappear check sees first-run output)
    const catalogRoot2 = run1.catalogRoot;
    const docsDir2 = makeTempDir();
    const run2 = await runImport({
      build: "3.0.0.test",
      accessedDate: "2026-05-09",
      datamineRoot: FIXTURE_DATAMINE,
      dryRun: false,
      catalogRoot: catalogRoot2,
      docsDir: docsDir2,
      curationFile,
    });

    const affixesJson2 = fs.readFileSync(
      path.join(catalogRoot2, "affixes.json"),
      "utf8"
    );
    const aspectsJson2 = fs.readFileSync(
      path.join(catalogRoot2, "aspects.json"),
      "utf8"
    );
    const uniquesJson2 = fs.readFileSync(
      path.join(catalogRoot2, "uniques.json"),
      "utf8"
    );

    expect(affixesJson2).toBe(affixesJson1);
    expect(aspectsJson2).toBe(aspectsJson1);
    expect(uniquesJson2).toBe(uniquesJson1);
    expect(run2.exitCode).toBe(run1.exitCode);
  });
});

// ─── Case 2: New-entry-needs-curation ────────────────────────────────────────

describe("Case 2: New-entry-needs-curation", () => {
  it("exits with code 1 when a new entry is not in curation", async () => {
    // Affix_Multi_CritDamage is multi-attribute: without a curation record it is
    // always flagged as needs-curation (D18), so removing it from curation guarantees
    // exit code 1. Single-attribute clean affixes auto-accept and cannot be used here.
    const curationFile = makeTempCuration({});
    const curationData = JSON.parse(fs.readFileSync(curationFile, "utf8"));
    delete curationData.affixes["Affix_Multi_CritDamage"];
    fs.writeFileSync(curationFile, JSON.stringify(curationData, null, 2), "utf8");

    const result = await runWithTempOutput(curationFile);

    expect(result.exitCode).toBe(1);

    // Check audit doc exists and contains the needs-curation entry
    const auditPath = path.join(result.docsDir, "datamine-import-3.0.0.test.md");
    expect(fs.existsSync(auditPath)).toBe(true);
    const auditDoc = fs.readFileSync(auditPath, "utf8");
    expect(auditDoc).toContain("Affix_Multi_CritDamage");
    expect(auditDoc).toContain("Needs Curation");
  });

  it("audit doc includes the needs-curation entry with a reason", async () => {
    // Remove Affix_Multi_CritDamage — multi-attribute, so always needs-curation without a record
    const curationFile = makeTempCuration({});
    const curationData = JSON.parse(fs.readFileSync(curationFile, "utf8"));
    delete curationData.affixes["Affix_Multi_CritDamage"];
    fs.writeFileSync(curationFile, JSON.stringify(curationData, null, 2), "utf8");

    const result = await runWithTempOutput(curationFile);
    expect(result.exitCode).toBe(1);

    const auditPath = path.join(result.docsDir, "datamine-import-3.0.0.test.md");
    const auditDoc = fs.readFileSync(auditPath, "utf8");
    expect(auditDoc).toContain("Affix_Multi_CritDamage");
  });
});

// ─── Case 3: Curation persistence (exclude) ──────────────────────────────────

describe("Case 3: Curation persistence — exclude", () => {
  it("excludes an affix when curation marks it as excluded", async () => {
    const curationFile = makeTempCuration({
      affixes: {
        Affix_Str_MaxLife: {
          action: "exclude",
          reason: "Test exclusion",
        },
      },
    });

    const result = await runWithTempOutput(curationFile);

    const affixesData = JSON.parse(
      fs.readFileSync(path.join(result.catalogRoot, "affixes.json"), "utf8")
    );
    const ids = affixesData.affixes.map((a: { id: string }) => a.id);
    expect(ids).not.toContain("affix_max_life");
  });

  it("includes an affix when curation marks it as include", async () => {
    const curationFile = makeTempCuration({});
    const result = await runWithTempOutput(curationFile);

    const affixesData = JSON.parse(
      fs.readFileSync(path.join(result.catalogRoot, "affixes.json"), "utf8")
    );
    const ids = affixesData.affixes.map((a: { id: string }) => a.id);
    expect(ids).toContain("affix_max_life");
  });
});

// ─── Case 4: Schema compliance ────────────────────────────────────────────────

describe("Case 4: Schema compliance", () => {
  let catalogRoot: string;
  let docsDir: string;

  beforeEach(async () => {
    const curationFile = makeTempCuration({});
    catalogRoot = makeTempDir();
    docsDir = makeTempDir();
    await runImport({
      build: "3.0.0.test",
      accessedDate: "2026-05-09",
      datamineRoot: FIXTURE_DATAMINE,
      dryRun: false,
      catalogRoot,
      docsDir,
      curationFile,
    });
  });

  it("affixes.json entries have required AffixEntry fields with per-IP-tier valueRanges", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    for (const affix of data.affixes) {
      expect(affix).toHaveProperty("id");
      expect(typeof affix.id).toBe("string");
      expect(affix).toHaveProperty("label");
      expect(affix).toHaveProperty("labelTemplate");
      expect(affix).toHaveProperty("valueRanges");
      expect(Array.isArray(affix.valueRanges)).toBe(true);
      expect(affix.valueRanges.length).toBeGreaterThanOrEqual(1);
      for (const band of affix.valueRanges) {
        expect(typeof band.minItemPower).toBe("number");
        expect(typeof band.min).toBe("number");
        expect(typeof band.max).toBe("number");
        expect(band.min).toBeLessThanOrEqual(band.max);
      }
      expect(affix).toHaveProperty("isPercent");
      expect(typeof affix.isPercent).toBe("boolean");
      expect(affix).toHaveProperty("slotRestrictions");
      expect(Array.isArray(affix.slotRestrictions)).toBe(true);
      expect(affix).toHaveProperty("classRestrictions");
      expect(Array.isArray(affix.classRestrictions)).toBe(true);
    }
  });

  it("aspects.json entries have required AspectEntry fields (including source)", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "aspects.json"), "utf8")
    );
    for (const aspect of data.aspects) {
      expect(aspect).toHaveProperty("id");
      expect(aspect).toHaveProperty("label");
      expect(aspect).toHaveProperty("labelTemplate");
      expect(aspect).toHaveProperty("valueRange");
      expect(Array.isArray(aspect.valueRange)).toBe(true);
      expect(aspect).toHaveProperty("isPercent");
      expect(aspect).toHaveProperty("slotRestrictions");
      expect(aspect).toHaveProperty("classRestrictions");
      expect(aspect).toHaveProperty("source");
      expect(["legendary", "codex"]).toContain(aspect.source);
    }
  });

  it("uniques.json entries have required UniqueEntry fields", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "uniques.json"), "utf8")
    );
    for (const unique of data.uniques) {
      expect(unique).toHaveProperty("id");
      expect(unique).toHaveProperty("label");
      expect(unique).toHaveProperty("slot");
      expect(unique).toHaveProperty("classRestrictions");
      expect(Array.isArray(unique.classRestrictions)).toBe(true);
    }
  });

  it("skills files have required SkillEntry fields", () => {
    const skillsDir = path.join(catalogRoot, "skills");
    if (!fs.existsSync(skillsDir)) return; // no skill kits in fixture

    const files = fs.readdirSync(skillsDir);
    for (const file of files) {
      const data = JSON.parse(
        fs.readFileSync(path.join(skillsDir, file), "utf8")
      );
      for (const skill of data.skills) {
        expect(skill).toHaveProperty("id");
        expect(skill).toHaveProperty("label");
        expect(skill).toHaveProperty("category");
        expect(skill).toHaveProperty("maxRank");
        expect(typeof skill.maxRank).toBe("number");
      }
    }
  });

  it("paragon files have required board and glyph fields", () => {
    const paragonDir = path.join(catalogRoot, "paragon");
    if (!fs.existsSync(paragonDir)) return;

    const files = fs.readdirSync(paragonDir);
    for (const file of files) {
      const data = JSON.parse(
        fs.readFileSync(path.join(paragonDir, file), "utf8")
      );
      for (const board of data.boards ?? []) {
        expect(board).toHaveProperty("id");
        expect(board).toHaveProperty("label");
      }
      for (const glyph of data.glyphs ?? []) {
        expect(glyph).toHaveProperty("id");
        expect(glyph).toHaveProperty("label");
      }
    }
  });

  it("percent scaling is correct: GearAffix_LifePercent [0.08, 0.14] → valueRanges[0] [8.0, 14.0]", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const lifePercent = data.affixes.find(
      (a: { id: string }) => a.id === "affix_max_life_pct"
    );
    expect(lifePercent).toBeTruthy();
    expect(lifePercent.valueRanges).toHaveLength(1);
    expect(lifePercent.valueRanges[0].min).toBeCloseTo(8.0, 3);
    expect(lifePercent.valueRanges[0].max).toBeCloseTo(14.0, 3);
    expect(lifePercent.valueRanges[0].minItemPower).toBe(1);
    expect(lifePercent.isPercent).toBe(true);
  });

  it("non-percent affix has correct value range: GearAffix_Life → valueRanges[0] [700, 2800]", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const maxLife = data.affixes.find(
      (a: { id: string }) => a.id === "affix_max_life"
    );
    expect(maxLife).toBeTruthy();
    expect(maxLife.valueRanges).toHaveLength(1);
    expect(maxLife.valueRanges[0]).toEqual({ minItemPower: 1, min: 700, max: 2800 });
    expect(maxLife.isPercent).toBe(false);
  });

  it("multi-value affix uses first attribute only (Affix_Multi_CritDamage)", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const critDmg = data.affixes.find(
      (a: { id: string }) => a.id === "affix_crit_damage"
    );
    expect(critDmg).toBeTruthy();
    // First attribute: Attr_Crit_Damage_Percent, formula [0.20, 0.50] scaled ×100 = [20, 50]
    expect(critDmg.valueRanges).toHaveLength(1);
    expect(critDmg.valueRanges[0]).toEqual({ minItemPower: 1, min: 20.0, max: 50.0 });
  });

  it("slot mapping: RING → ring1 and ring2", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const critDmg = data.affixes.find(
      (a: { id: string }) => a.id === "affix_crit_damage"
    );
    expect(critDmg).toBeTruthy();
    expect(critDmg.slotRestrictions).toContain("ring1");
    expect(critDmg.slotRestrictions).toContain("ring2");
  });

  it("barb weapon fan-out: WEAPON slot includes all 4 barb weapon slots", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const critDmg = data.affixes.find(
      (a: { id: string }) => a.id === "affix_crit_damage"
    );
    expect(critDmg).toBeTruthy();
    expect(critDmg.slotRestrictions).toContain("weapon");
    expect(critDmg.slotRestrictions).toContain("barb_1h_main");
    expect(critDmg.slotRestrictions).toContain("barb_1h_off");
    expect(critDmg.slotRestrictions).toContain("barb_2h_bludgeoning");
    expect(critDmg.slotRestrictions).toContain("barb_2h_slashing");
  });

  it("WIP affix is excluded from output (not in curation, WIP label)", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const wip = data.affixes.find(
      (a: { bnetFileName?: string }) => a.bnetFileName === "Affix_WIP_TestEntry"
    );
    expect(wip).toBeUndefined();
  });

  it("aspect has required fields including bnetId and bnetFileName", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "aspects.json"), "utf8")
    );
    const disobedience = data.aspects.find(
      (a: { id: string }) => a.id === "aspect_of_disobedience"
    );
    expect(disobedience).toBeTruthy();
    expect(disobedience.bnetId).toBe(2000001);
    expect(disobedience.bnetFileName).toBe("legendary_disobedience");
  });

  it("unique item is written to uniques.json with correct shape", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "uniques.json"), "utf8")
    );
    const sword = data.uniques.find(
      (u: { id: string }) => u.id === "unique_sword_test"
    );
    expect(sword).toBeTruthy();
    expect(sword.slot).toBe("weapon");
    expect(sword.bnetId).toBe(3000001);
    expect(sword.bnetFileName).toBe("Unique_Sword_Test");
  });

  it("Barbarian skill Bash is written to skills/Barbarian.json", () => {
    const skillsPath = path.join(catalogRoot, "skills", "Barbarian.json");
    expect(fs.existsSync(skillsPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(skillsPath, "utf8"));
    const bash = data.skills.find((s: { id: string }) => s.id === "barb_bash");
    expect(bash).toBeTruthy();
    expect(bash.label).toBe("Bash");
    expect(bash.category).toBe("basic");
    expect(bash.maxRank).toBe(9);
  });

  it("Barbarian paragon board is written to paragon/Barbarian.json", () => {
    const paragonPath = path.join(catalogRoot, "paragon", "Barbarian.json");
    expect(fs.existsSync(paragonPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(paragonPath, "utf8"));
    const starter = data.boards.find((b: { id: string }) => b.id === "barb_starter");
    expect(starter).toBeTruthy();
    expect(starter.isStarterBoard).toBe(true);
  });

  it("Barbarian paragon glyph Imbiber is written to paragon/glyphs.json pool (D5)", () => {
    // After shared-pool refactor, glyphs live in paragon/glyphs.json, not per-class files.
    const glyphsPath = path.join(catalogRoot, "paragon", "glyphs.json");
    expect(fs.existsSync(glyphsPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(glyphsPath, "utf8"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imbiber = data.glyphs.find((g: any) => g.id === "glyph_imbiber");
    expect(imbiber).toBeTruthy();
    // Pool entry carries classAffinity (not per-class bnetFileName at top level)
    expect(imbiber.classAffinity).toContain("Barbarian");
    expect(imbiber.bnetSources.Barbarian.bnetFileName).toBe("Rare_011_Willpower_Side");
  });

  it("D10: per-class paragon files have no glyphs key; glyphs.json has the shared pool", () => {
    // D6: per-class files carry only { class, verifiedAgainst, boards }
    // D5: the single shared pool lives in paragon/glyphs.json
    const paragonDir = path.join(catalogRoot, "paragon");
    if (!fs.existsSync(paragonDir)) return;

    const files = fs.readdirSync(paragonDir);
    for (const file of files) {
      const data = JSON.parse(
        fs.readFileSync(path.join(paragonDir, file), "utf8")
      );
      if (file === "glyphs.json") {
        // Pool file: must have glyphs array, must NOT have boards
        expect(data).toHaveProperty("glyphs");
        expect(Array.isArray(data.glyphs)).toBe(true);
        expect(data).not.toHaveProperty("boards");
      } else {
        // Per-class file: must have boards array, must NOT have glyphs (D6)
        expect(data).toHaveProperty("boards");
        expect(data).not.toHaveProperty("glyphs");
      }
    }
  });

  it("D10: paragon/glyphs.json pool has no duplicate catalogIds", () => {
    const glyphsPath = path.join(catalogRoot, "paragon", "glyphs.json");
    if (!fs.existsSync(glyphsPath)) return;
    const data = JSON.parse(fs.readFileSync(glyphsPath, "utf8"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = data.glyphs.map((g: any) => g.id as string);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("audit doc is created with correct structure", () => {
    const auditPath = path.join(docsDir, "datamine-import-3.0.0.test.md");
    expect(fs.existsSync(auditPath)).toBe(true);
    const doc = fs.readFileSync(auditPath, "utf8");
    expect(doc).toContain("# D4 Datamine Import — Build 3.0.0.test");
    expect(doc).toContain("## Summary");
    expect(doc).toContain("## Affixes");
    expect(doc).toContain("## Aspects");
    expect(doc).toContain("## Skills by Class");
    expect(doc).toContain("## Paragon Glyphs (shared pool)");
    expect(doc).toContain("## Paragon by Class");
  });

  // ─── v15: new field shape assertions ──────────────────────────────────────

  it("v15 D6: affix entries carry attribute field with eAttribute and nParam", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const maxLife = data.affixes.find(
      (a: { id: string }) => a.id === "affix_max_life"
    );
    expect(maxLife).toBeTruthy();
    expect(maxLife.attribute).toBeDefined();
    expect(maxLife.attribute.eAttribute).toBe("Attr_Max_Life");
    expect(typeof maxLife.attribute.nParam).toBe("number");
  });

  it("v15 D6: multi-attribute affix carries first attribute's eAttribute", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const critDmg = data.affixes.find(
      (a: { id: string }) => a.id === "affix_crit_damage"
    );
    expect(critDmg).toBeTruthy();
    // First attribute is Attr_Crit_Damage_Percent (D6: first-only)
    expect(critDmg.attribute.eAttribute).toBe("Attr_Crit_Damage_Percent");
  });

  it("v15 D7: aspect entries carry isDistinctMultiplier field (defaults false)", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "aspects.json"), "utf8")
    );
    const disobedience = data.aspects.find(
      (a: { id: string }) => a.id === "aspect_of_disobedience"
    );
    expect(disobedience).toBeTruthy();
    // No curation isDistinctMultiplier set → false (not emitted when false per serializer)
    expect(disobedience.isDistinctMultiplier).toBeFalsy();
  });

  it("v15 D8: unique items carry intrinsicAffixes when ptItemAffixAttributes present", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "uniques.json"), "utf8")
    );
    const sword = data.uniques.find(
      (u: { id: string }) => u.id === "unique_sword_test"
    );
    expect(sword).toBeTruthy();
    expect(Array.isArray(sword.intrinsicAffixes)).toBe(true);
    expect(sword.intrinsicAffixes).toHaveLength(1);
    expect(sword.intrinsicAffixes[0].attribute.eAttribute).toBe("Attr_Skill_Damage_Percent");
    expect(Array.isArray(sword.intrinsicAffixes[0].valueRange)).toBe(true);
    expect(sword.intrinsicAffixes[0].valueRange).toHaveLength(2);
  });

  it("v15 D5: Barbarian Bash carries scalingAttributes extracted from Power file", () => {
    const skillsPath = path.join(catalogRoot, "skills", "Barbarian.json");
    expect(fs.existsSync(skillsPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(skillsPath, "utf8"));
    const bash = data.skills.find((s: { id: string }) => s.id === "barb_bash");
    expect(bash).toBeTruthy();
    expect(Array.isArray(bash.scalingAttributes)).toBe(true);
    expect(bash.scalingAttributes).toHaveLength(1);
    // Normalized field names (not fScaleValue / nRankScale)
    expect(bash.scalingAttributes[0].attribute).toBe("Attr_Skill_Damage_Percent");
    expect(bash.scalingAttributes[0].scaleValue).toBeCloseTo(0.40);
    expect(bash.scalingAttributes[0].rankScale).toBeCloseTo(0.04);
  });

  it("v15 D5: Barbarian Bash carries tags from Power file", () => {
    const skillsPath = path.join(catalogRoot, "skills", "Barbarian.json");
    const data = JSON.parse(fs.readFileSync(skillsPath, "utf8"));
    const bash = data.skills.find((s: { id: string }) => s.id === "barb_bash");
    expect(bash).toBeTruthy();
    expect(Array.isArray(bash.tags)).toBe(true);
    expect(bash.tags).toContain("Physical");
    expect(bash.tags).toContain("Basic");
  });

  it("v15 D5: Barbarian Bash carries resourceCostPerCast and cooldownSeconds", () => {
    const skillsPath = path.join(catalogRoot, "skills", "Barbarian.json");
    const data = JSON.parse(fs.readFileSync(skillsPath, "utf8"));
    const bash = data.skills.find((s: { id: string }) => s.id === "barb_bash");
    expect(bash).toBeTruthy();
    expect(bash.resourceCostPerCast).toBe(0.0);
    expect(bash.cooldownSeconds).toBe(0.0);
  });

  // ─── D5: jewelry-implicit fallback via manualValueRanges ──────────────────

  it("D5: Affix_AllRes_Amulet is in catalog with manualValueRanges-derived band (not zero)", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const allRes = data.affixes.find(
      (a: { id: string }) => a.id === "affix_all_res_amulet"
    );
    expect(allRes).toBeTruthy();
    // isImplicit flag should be set
    expect(allRes.isImplicit).toBe(true);
    // Must have exactly the manualValueRanges band from curation (not a zero band)
    expect(allRes.valueRanges).toHaveLength(1);
    expect(allRes.valueRanges[0].min).toBe(5);
    expect(allRes.valueRanges[0].max).toBe(25);
    expect(allRes.valueRanges[0].minItemPower).toBe(0);
  });
});

// ─── Case 6: Bucket-coverage gate ────────────────────────────────────────────
//
// Affix_Unmapped_Bucket_Test.aff.json carries eAttribute "Attr_Bucket_Test_Unmapped_XYZ"
// which is absent from lib/damage/config.json attributeToBucket. Excluded by default in
// curation.json — test cases flip the action to exercise the gate.

describe("Case 6A: Bucket-coverage gate — baseline (all attributes mapped)", () => {
  it("exits 0 and audit doc contains ## Bucket Coverage section with no unmapped entries", async () => {
    const curationFile = makeTempCuration({});
    const result = await runWithTempOutput(curationFile);

    expect(result.exitCode).toBe(0);

    const auditPath = path.join(result.docsDir, "datamine-import-3.0.0.test.md");
    expect(fs.existsSync(auditPath)).toBe(true);
    const auditDoc = fs.readFileSync(auditPath, "utf8");
    expect(auditDoc).toContain("## Bucket Coverage");
    expect(auditDoc).toContain("_All attributes mapped._");
  });
});

describe("Case 6B: Bucket-coverage gate — unmapped active affix (exit code 1, no catalog writes)", () => {
  it("exits 1 when an active affix carries an unmapped eAttribute", async () => {
    // Flip Affix_Unmapped_Bucket_Test from exclude → include so the gate sees it
    const curationFile = makeTempCuration({
      affixes: {
        Affix_Unmapped_Bucket_Test: {
          action: "include",
          catalogId: "affix_unmapped_bucket_test",
          label: "Test Unmapped Bucket",
          reason: "Test: enabled to verify bucket-coverage fail-loud path (Case 6B)",
        },
      },
    });

    const catalogRoot = makeTempDir();
    const docsDir = makeTempDir();
    const result = await runImport({
      build: "3.0.0.test",
      accessedDate: "2026-05-09",
      datamineRoot: FIXTURE_DATAMINE,
      dryRun: false,
      catalogRoot,
      docsDir,
      curationFile,
    });

    // Gate must abort with exit code 1
    expect(result.exitCode).toBe(1);

    // Audit doc is always written
    const auditPath = path.join(docsDir, "datamine-import-3.0.0.test.md");
    expect(fs.existsSync(auditPath)).toBe(true);
    const auditDoc = fs.readFileSync(auditPath, "utf8");

    // Unmapped attribute and its catalog ID must appear in the Bucket Coverage section
    expect(auditDoc).toContain("## Bucket Coverage");
    expect(auditDoc).toContain("Attr_Bucket_Test_Unmapped_XYZ");
    expect(auditDoc).toContain("affix_unmapped_bucket_test");

    // Catalog files must NOT be written on exit 1
    expect(fs.existsSync(path.join(catalogRoot, "affixes.json"))).toBe(false);
  });
});

describe("Case 6C: Bucket-coverage gate — deprecated affix with unmapped attribute (D10)", () => {
  it("exits 1 and includes the deprecated entry's unmapped attribute in the audit doc", async () => {
    // D10: deprecated affixes still need bucket entries — they throw at runtime
    // if equipped on a saved character. Flip Affix_Unmapped_Bucket_Test to deprecated.
    const curationFile = makeTempCuration({
      affixes: {
        Affix_Unmapped_Bucket_Test: {
          action: "deprecated",
          catalogId: "affix_unmapped_bucket_test_deprecated",
          label: "Test Unmapped Deprecated",
          reason: "Test: deprecated action to verify D10 deprecated-inclusion in gate (Case 6C)",
        },
      },
    });

    const catalogRoot = makeTempDir();
    const docsDir = makeTempDir();
    const result = await runImport({
      build: "3.0.0.test",
      accessedDate: "2026-05-09",
      datamineRoot: FIXTURE_DATAMINE,
      dryRun: false,
      catalogRoot,
      docsDir,
      curationFile,
    });

    // Gate still fires for deprecated entries (D10)
    expect(result.exitCode).toBe(1);

    const auditPath = path.join(docsDir, "datamine-import-3.0.0.test.md");
    const auditDoc = fs.readFileSync(auditPath, "utf8");

    // Deprecated entry's attribute must appear in the Bucket Coverage section
    expect(auditDoc).toContain("## Bucket Coverage");
    expect(auditDoc).toContain("Attr_Bucket_Test_Unmapped_XYZ");
    expect(auditDoc).toContain("affix_unmapped_bucket_test_deprecated");
  });
});

// ─── Case 5: Unsupported DSL function → fail-loud (exit code 1) ──────────────

describe("Case 5: Unsupported DSL function → fail-loud", () => {
  it("exits with code 1 when a formula uses an unsupported DSL function", async () => {
    // Affix_Paragon_Unsupported is excluded in the base curation to avoid affecting
    // other tests. Here we flip it to "include" to exercise the unsupported-function
    // code path end-to-end through the orchestrator.
    const curationFile = makeTempCuration({
      affixes: {
        Affix_Paragon_Unsupported: {
          action: "include",
          catalogId: "affix_paragon_unsupported",
          label: "Paragon Power Test",
          reason: "Test: enabled to verify unsupported-function fail-loud path (Case 5)",
        },
      },
    });

    const result = await runWithTempOutput(curationFile);

    // Pipeline must abort with exit code 1 — catalog files are NOT written
    expect(result.exitCode).toBe(1);

    // Audit doc is always written so the user can see what needs attention
    const auditPath = path.join(result.docsDir, "datamine-import-3.0.0.test.md");
    expect(fs.existsSync(auditPath)).toBe(true);
    const auditDoc = fs.readFileSync(auditPath, "utf8");
    expect(auditDoc).toContain("Affix_Paragon_Unsupported");
    expect(auditDoc).toContain("unsupported-function");
  });

  it("catalog files are NOT written when an unsupported function is encountered", async () => {
    const curationFile = makeTempCuration({
      affixes: {
        Affix_Paragon_Unsupported: {
          action: "include",
          catalogId: "affix_paragon_unsupported",
          label: "Paragon Power Test",
          reason: "Test: enabled to verify catalog-skip on unsupported-function",
        },
      },
    });

    const catalogRoot2 = makeTempDir();
    const docsDir2 = makeTempDir();
    const run = await runImport({
      build: "3.0.0.test",
      accessedDate: "2026-05-09",
      datamineRoot: FIXTURE_DATAMINE,
      dryRun: false,
      catalogRoot: catalogRoot2,
      docsDir: docsDir2,
      curationFile,
    });

    expect(run.exitCode).toBe(1);
    // No affixes.json should be written on error exit
    expect(fs.existsSync(path.join(catalogRoot2, "affixes.json"))).toBe(false);
  });
});

// ─── Case 7: weaponSpeedClass propagation ─────────────────────────────────────

describe("Case 7: weaponSpeedClass propagation", () => {
  let catalogRoot: string;

  beforeEach(async () => {
    const curationFile = makeTempCuration({});
    const result = await runWithTempOutput(curationFile);
    catalogRoot = result.catalogRoot;
    expect(result.exitCode).toBe(0);
  });

  it("VeryFast fixture entry has weaponSpeedClass=VeryFast in output catalog", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const entry = data.affixes.find(
      (a: { id: string }) => a.id === "affix_weapon_damage_1h_dagger"
    );
    expect(entry).toBeTruthy();
    expect(entry.weaponSpeedClass).toBe("VeryFast");
    expect(entry.isImplicit).toBe(true);
  });

  it("Fast fixture entry has weaponSpeedClass=Fast in output catalog", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const entry = data.affixes.find(
      (a: { id: string }) => a.id === "affix_weapon_damage_1h_sword"
    );
    expect(entry).toBeTruthy();
    expect(entry.weaponSpeedClass).toBe("Fast");
    expect(entry.isImplicit).toBe(true);
  });

  it("Normal fixture entry has weaponSpeedClass=Normal in output catalog", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const entry = data.affixes.find(
      (a: { id: string }) => a.id === "affix_weapon_damage_2h_sword"
    );
    expect(entry).toBeTruthy();
    expect(entry.weaponSpeedClass).toBe("Normal");
    expect(entry.isImplicit).toBe(true);
  });

  it("Slow fixture entry has weaponSpeedClass=Slow in output catalog", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const entry = data.affixes.find(
      (a: { id: string }) => a.id === "affix_weapon_damage_2h_axe"
    );
    expect(entry).toBeTruthy();
    expect(entry.weaponSpeedClass).toBe("Slow");
    expect(entry.isImplicit).toBe(true);
  });

  it("weapon-damage entries carry Weapon_Damage_Min attribute in output catalog", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const entry = data.affixes.find(
      (a: { id: string }) => a.id === "affix_weapon_damage_1h_dagger"
    );
    expect(entry?.attribute?.eAttribute).toBe("Weapon_Damage_Min");
  });
});
