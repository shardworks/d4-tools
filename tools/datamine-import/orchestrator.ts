/**
 * Import orchestrator.
 *
 * Coordinates: load curation → run transformers → check disappeared entries →
 * generate audit doc → write files.
 */

import * as path from "node:path";
import * as fs from "node:fs";

import { loadCuration } from "./curation";
import {
  loadAffixes,
  loadAspects,
  loadItems,
  loadSkillKits,
  loadParagonBoards,
  loadParagonGlyphs,
  loadStringTable,
} from "./reader";
import { transformAffixes } from "./sections/affixes";
import { transformAspects } from "./sections/aspects";
import { transformUniques } from "./sections/uniques";
import { transformAllSkills } from "./sections/skills";
import { transformParagonForClass } from "./sections/paragon";
import { generateAuditDoc, writeAuditDoc } from "./audit";
import {
  writeAffixes,
  writeAspects,
  writeUniques,
  writeSkills,
  writeParagon,
} from "./writer";
import type { VerifiedAgainst } from "../../lib/catalog/index";

// ─── Options ──────────────────────────────────────────────────────────────────

export interface ImportOptions {
  build: string;
  accessedDate: string;
  datamineRoot: string;
  dryRun: boolean;
  catalogRoot: string;
  docsDir: string;
  curationFile: string;
}

// ─── Classes to process ───────────────────────────────────────────────────────

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

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runImport(
  options: ImportOptions
): Promise<{ exitCode: number }> {
  const {
    build,
    accessedDate,
    datamineRoot,
    dryRun,
    catalogRoot,
    docsDir,
    curationFile,
  } = options;

  let exitCode = 0;

  try {
    // 1. Load curation
    let curation;
    try {
      curation = loadCuration(curationFile);
    } catch (err) {
      console.error(`Error loading curation file: ${err}`);
      return { exitCode: 2 };
    }

    // 2. Load datamine data
    console.log("Loading datamine data...");
    const rawAffixes = loadAffixes(datamineRoot);
    const rawPowers = loadAspects(datamineRoot);
    const rawItems = loadItems(datamineRoot);
    const skillKits = loadSkillKits(datamineRoot);
    const rawBoards = loadParagonBoards(datamineRoot);
    const rawGlyphs = loadParagonGlyphs(datamineRoot);
    const stringTable = loadStringTable(datamineRoot);

    console.log(
      `Loaded: ${rawAffixes.length} affixes, ${rawPowers.length} aspects, ` +
      `${rawItems.length} items, ${skillKits.size} skill kits, ` +
      `${rawBoards.length} boards, ${rawGlyphs.length} glyphs`
    );

    // 3. Run transformers
    console.log("Transforming data...");
    const affixSummary = transformAffixes(rawAffixes, stringTable, curation);
    const aspectSummary = transformAspects(rawPowers, stringTable, curation);
    const uniqueSummary = transformUniques(rawItems, stringTable, curation);

    const skillsByClass: ReturnType<typeof transformAllSkills> =
      transformAllSkills(skillKits, stringTable, curation);

    const paragonByClass: Record<
      string,
      {
        boards: ReturnType<typeof transformParagonForClass>["boards"];
        glyphs: ReturnType<typeof transformParagonForClass>["glyphs"];
      }
    > = {};
    for (const className of ALL_CLASSES) {
      paragonByClass[className] = transformParagonForClass(
        rawBoards,
        rawGlyphs,
        stringTable,
        curation,
        className
      );
    }

    // 4. Check for disappeared entries (D13)
    const disappearedWarnings = checkDisappearedEntries(
      catalogRoot,
      affixSummary.entries.map((e) => e.id),
      aspectSummary.entries.map((e) => e.id),
      curation
    );
    if (disappearedWarnings.length > 0) {
      for (const warning of disappearedWarnings) {
        console.warn(`[DISAPPEARED] ${warning}`);
      }
      exitCode = Math.max(exitCode, 1);
    }

    // 5. Generate audit doc
    const verifiedAgainst: VerifiedAgainst = {
      expansion: "Lord of Hatred",
      season: "Season 13 (Season of Reckoning)",
      patch: build,
      accessedDate,
    };

    const auditDoc = generateAuditDoc({
      build,
      accessedDate,
      affixes: affixSummary,
      aspects: aspectSummary,
      uniques: uniqueSummary,
      skillsByClass,
      paragonByClass,
    });

    writeAuditDoc(auditDoc, build, docsDir, dryRun);

    // 6. Check needs-curation exit code
    const anyNeedsCuration =
      affixSummary.needsCuration.length > 0 ||
      aspectSummary.needsCuration.length > 0 ||
      uniqueSummary.needsCuration.length > 0 ||
      Object.values(skillsByClass).some((s) => s.needsCuration.length > 0) ||
      Object.values(paragonByClass).some(
        (p) => p.boards.needsCuration.length > 0 || p.glyphs.needsCuration.length > 0
      );

    if (anyNeedsCuration) {
      console.warn("Some entries need curation. See audit doc for details.");
      exitCode = Math.max(exitCode, 1);
    }

    // 7. Write files
    console.log(dryRun ? "[dry-run] Skipping file writes." : "Writing catalog files...");
    writeAffixes(affixSummary, verifiedAgainst, catalogRoot, dryRun);
    writeAspects(aspectSummary, verifiedAgainst, catalogRoot, dryRun);
    writeUniques(uniqueSummary, verifiedAgainst, catalogRoot, dryRun);
    writeSkills(skillsByClass, verifiedAgainst, catalogRoot, dryRun);
    writeParagon(paragonByClass, verifiedAgainst, catalogRoot, dryRun);

    // Print summary
    printSummary(affixSummary, aspectSummary, uniqueSummary, skillsByClass, paragonByClass);

    return { exitCode };
  } catch (err) {
    console.error("Fatal error during import:", err);
    return { exitCode: 2 };
  }
}

// ─── Disappeared entries check (D13) ─────────────────────────────────────────

function checkDisappearedEntries(
  catalogRoot: string,
  newAffixIds: string[],
  newAspectIds: string[],
  curation: { affixes: Record<string, { action: string }>; aspects: Record<string, { action: string }> }
): string[] {
  const warnings: string[] = [];

  // Check existing affixes.json
  const affixesPath = path.join(catalogRoot, "affixes.json");
  if (fs.existsSync(affixesPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(affixesPath, "utf8"));
      const existing: string[] = (data.affixes ?? []).map(
        (a: { id: string }) => a.id
      );
      const newIdSet = new Set(newAffixIds);

      for (const existingId of existing) {
        if (!newIdSet.has(existingId)) {
          // Check if curated as deprecated/excluded
          const bnetFileName = findBnetFileNameForId(curation.affixes, existingId);
          const record = bnetFileName ? curation.affixes[bnetFileName] : undefined;
          if (!record || (record.action !== "deprecated" && record.action !== "exclude")) {
            warnings.push(
              `Affix '${existingId}' exists in catalog but was not found in new datamine import`
            );
          }
        }
      }
    } catch {
      // Ignore read errors on first run
    }
  }

  // Check existing aspects.json
  const aspectsPath = path.join(catalogRoot, "aspects.json");
  if (fs.existsSync(aspectsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(aspectsPath, "utf8"));
      const existing: string[] = (data.aspects ?? []).map(
        (a: { id: string }) => a.id
      );
      const newIdSet = new Set(newAspectIds);

      for (const existingId of existing) {
        if (!newIdSet.has(existingId)) {
          const bnetFileName = findBnetFileNameForId(curation.aspects, existingId);
          const record = bnetFileName ? curation.aspects[bnetFileName] : undefined;
          if (!record || (record.action !== "deprecated" && record.action !== "exclude")) {
            warnings.push(
              `Aspect '${existingId}' exists in catalog but was not found in new datamine import`
            );
          }
        }
      }
    } catch {
      // Ignore read errors on first run
    }
  }

  return warnings;
}

function findBnetFileNameForId(
  section: Record<string, { action: string; catalogId?: string }>,
  catalogId: string
): string | undefined {
  for (const [bnetFileName, record] of Object.entries(section)) {
    if (record.catalogId === catalogId) return bnetFileName;
  }
  return undefined;
}

// ─── Print summary ────────────────────────────────────────────────────────────

function printSummary(
  affixes: { entries: unknown[]; needsCuration: unknown[]; excluded: unknown[] },
  aspects: { entries: unknown[]; needsCuration: unknown[]; excluded: unknown[] },
  uniques: { entries: unknown[]; needsCuration: unknown[]; excluded: unknown[] },
  skillsByClass: Record<string, { entries: unknown[]; needsCuration: unknown[] }>,
  paragonByClass: Record<
    string,
    {
      boards: { entries: unknown[]; needsCuration: unknown[] };
      glyphs: { entries: unknown[]; needsCuration: unknown[] };
    }
  >
): void {
  const totalSkills = Object.values(skillsByClass).reduce(
    (sum, s) => sum + s.entries.length,
    0
  );
  const totalBoards = Object.values(paragonByClass).reduce(
    (sum, p) => sum + p.boards.entries.length,
    0
  );
  const totalGlyphs = Object.values(paragonByClass).reduce(
    (sum, p) => sum + p.glyphs.entries.length,
    0
  );

  console.log("\nImport complete:");
  console.log(`  Affixes:  ${affixes.entries.length} imported, ${affixes.needsCuration.length} needs-curation, ${affixes.excluded.length} excluded`);
  console.log(`  Aspects:  ${aspects.entries.length} imported, ${aspects.needsCuration.length} needs-curation, ${aspects.excluded.length} excluded`);
  console.log(`  Uniques:  ${uniques.entries.length} imported, ${uniques.needsCuration.length} needs-curation, ${uniques.excluded.length} excluded`);
  console.log(`  Skills:   ${totalSkills} total across all classes`);
  console.log(`  Boards:   ${totalBoards} total across all classes`);
  console.log(`  Glyphs:   ${totalGlyphs} total across all classes`);
}
