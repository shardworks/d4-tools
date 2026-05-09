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

  it("affixes.json entries have required AffixEntry fields", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    for (const affix of data.affixes) {
      expect(affix).toHaveProperty("id");
      expect(typeof affix.id).toBe("string");
      expect(affix).toHaveProperty("label");
      expect(affix).toHaveProperty("labelTemplate");
      expect(affix).toHaveProperty("valueRange");
      expect(Array.isArray(affix.valueRange)).toBe(true);
      expect(affix.valueRange).toHaveLength(2);
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

  it("percent scaling is correct: Attr_Max_Life_Percent [0.08, 0.14] → [8.0, 14.0]", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const lifePercent = data.affixes.find(
      (a: { id: string }) => a.id === "affix_max_life_pct"
    );
    expect(lifePercent).toBeTruthy();
    expect(lifePercent.valueRange[0]).toBeCloseTo(8.0, 3);
    expect(lifePercent.valueRange[1]).toBeCloseTo(14.0, 3);
    expect(lifePercent.isPercent).toBe(true);
  });

  it("non-percent affix has correct value range: [700, 2800]", () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(catalogRoot, "affixes.json"), "utf8")
    );
    const maxLife = data.affixes.find(
      (a: { id: string }) => a.id === "affix_max_life"
    );
    expect(maxLife).toBeTruthy();
    expect(maxLife.valueRange).toEqual([700, 2800]);
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
    // First attribute: Attr_Crit_Damage_Percent, afValue [0.20, 0.50] scaled ×100 = [20, 50]
    expect(critDmg.valueRange).toEqual([20.0, 50.0]);
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
    expect(disobedience.bnetFileName).toBe("Aspect_Disobedience");
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
    expect(bash.maxRank).toBe(5);
  });

  it("Barbarian paragon board is written to paragon/Barbarian.json", () => {
    const paragonPath = path.join(catalogRoot, "paragon", "Barbarian.json");
    expect(fs.existsSync(paragonPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(paragonPath, "utf8"));
    const starter = data.boards.find((b: { id: string }) => b.id === "barb_starter");
    expect(starter).toBeTruthy();
    expect(starter.isStarterBoard).toBe(true);
  });

  it("Barbarian paragon glyph Imbiber is written to paragon/Barbarian.json", () => {
    const paragonPath = path.join(catalogRoot, "paragon", "Barbarian.json");
    const data = JSON.parse(fs.readFileSync(paragonPath, "utf8"));
    const imbiber = data.glyphs.find((g: { id: string }) => g.id === "glyph_imbiber");
    expect(imbiber).toBeTruthy();
    expect(imbiber.bnetFileName).toBe("Rare_011_Willpower_Side");
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
});
