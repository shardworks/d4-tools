/**
 * Import orchestrator.
 *
 * Coordinates: load curation → run transformers → check disappeared entries →
 * generate audit doc → write files.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { loadCuration } from "./curation";
// D11: read bundled baseline directly — do NOT use loadDamageConfig() which merges local overrides.
import bundledDamageConfig from "../../lib/damage/config.json";
import {
  loadAffixes,
  loadAspects,
  loadItems,
  loadSkillKits,
  loadParagonBoards,
  loadParagonGlyphs,
  loadStringTable,
  loadAttributeFormulas,
  loadGlobals,
} from "./reader";
import { transformAffixes } from "./sections/affixes";
import type { AffixTransformerSummary } from "./sections/affixes";
import type { TransformerSummary } from "./sections/types";
import { transformAspects } from "./sections/aspects";
import { transformUniques } from "./sections/uniques";
import { transformAllSkills } from "./sections/skills";
import { transformParagonBoardsForClass, transformParagonGlyphs } from "./sections/paragon";
import { generateAuditDoc, writeAuditDoc } from "./audit";
import type { BucketCoverageResult } from "./audit";
import {
  writeAffixes,
  writeAspects,
  writeUniques,
  writeSkills,
  writeParagon,
} from "./writer";
import type {
  VerifiedAgainst,
  AffixEntry,
  AspectEntry,
  ParagonBoardEntry,
} from "../../lib/catalog/index";

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
    const formulaTable = loadAttributeFormulas(datamineRoot);
    const globals = loadGlobals(datamineRoot);

    console.log(
      `Loaded: ${rawAffixes.length} affixes, ${rawPowers.length} aspects, ` +
      `${rawItems.length} items, ${skillKits.size} skill kits, ` +
      `${rawBoards.length} boards, ${rawGlyphs.length} glyphs`
    );

    // 3. Run transformers
    console.log("Transforming data...");
    const affixSummary = transformAffixes(rawAffixes, stringTable, curation, formulaTable, globals.scalars);
    const aspectSummary = transformAspects(rawPowers, stringTable, curation);
    const uniqueSummary = transformUniques(rawItems, stringTable, curation);

    // v15 (D5): pass datamineRoot to skills transformer; getPowerByFileName in reader.ts
    // handles the Power-file directory walk and per-root caching (D1/D2/D3).
    const skillsByClass: ReturnType<typeof transformAllSkills> =
      transformAllSkills(skillKits, stringTable, curation, datamineRoot);

    // Paragon boards: per-class transformation (unchanged)
    const paragonBoardsByClass: Record<string, ReturnType<typeof transformParagonBoardsForClass>> = {};
    for (const className of ALL_CLASSES) {
      paragonBoardsByClass[className] = transformParagonBoardsForClass(
        rawBoards,
        stringTable,
        curation,
        className
      );
    }

    // Paragon glyphs: single-pass shared-pool transformation (D5)
    const { pool: glyphPool, conflicts: paragonGlyphConflicts } = transformParagonGlyphs(
      rawGlyphs,
      stringTable,
      curation
    );

    // 4. Check for disappeared entries (D13).
    // Entries that are in the existing catalog but absent from the new datamine
    // are either:
    //   (a) curated as deprecated → emitted with deprecated:true (spec case 3)
    //   (b) curated as excluded   → silently omitted
    //   (c) uncurated             → warn and exit 1 until decision recorded
    const { warnings: disappearedWarnings, deprecatedAffixes, deprecatedAspects } =
      collectDisappearedEntries(
        catalogRoot,
        affixSummary.entries.map((e) => e.id),
        aspectSummary.entries.map((e) => e.id),
        curation
      );

    // Merge deprecated-disappeared entries into the live summaries so they
    // appear in catalog output and in the audit document.
    for (const dep of deprecatedAffixes) affixSummary.entries.push(dep);
    for (const dep of deprecatedAspects) aspectSummary.entries.push(dep);

    if (disappearedWarnings.length > 0) {
      for (const warning of disappearedWarnings) {
        console.warn(`[DISAPPEARED] ${warning}`);
      }
      exitCode = Math.max(exitCode, 1);
    }

    // 5. Check needs-curation exit code BEFORE generating audit doc or writing.
    // Writing partial catalog output when entries are unresolved would silently
    // shrink the catalog on reruns. Instead, abort writes and require the user
    // to update curation.json first.
    const anyNeedsCuration =
      affixSummary.needsCuration.length > 0 ||
      aspectSummary.needsCuration.length > 0 ||
      uniqueSummary.needsCuration.length > 0 ||
      Object.values(skillsByClass).some((s) => s.needsCuration.length > 0) ||
      Object.values(paragonBoardsByClass).some((p) => p.needsCuration.length > 0) ||
      glyphPool.needsCuration.length > 0;

    if (anyNeedsCuration) {
      console.warn("Some entries need curation. See audit doc for details.");
      exitCode = Math.max(exitCode, 1);
    }

    // 5b. Check paragon glyph conflicts (D12).
    // Unresolvable dedup conflicts (same catalogId, same class, different data)
    // set exit code 1 and skip writes, mirroring the anyNeedsCuration gate.
    if (paragonGlyphConflicts.length > 0) {
      console.warn(
        `[paragon-glyph-conflicts] ${paragonGlyphConflicts.length} conflict(s) detected — see audit doc.`
      );
      for (const c of paragonGlyphConflicts) {
        console.warn(`  [conflict] ${c.catalogId}: ${c.reason}`);
      }
      exitCode = Math.max(exitCode, 1);
    }

    // 5c. Bucket-coverage gate (D7, D8, D10, D11).
    // Check that every eAttribute value on affix and aspect entries (including
    // deprecated) maps to an entry in the bundled lib/damage/config.json.
    // Reads the bundled JSON directly — not via loadDamageConfig() — so the
    // per-deployment local override cannot mask a missing baseline entry (D11).
    const bucketCoverage = validateBucketCoverage(affixSummary, aspectSummary);
    if (bucketCoverage.unmappedAttributes.length > 0) {
      console.warn(
        `[bucket-coverage] ${bucketCoverage.unmappedAttributes.length} unmapped attribute(s) — ` +
        `see audit doc ## Bucket Coverage section for details.`
      );
      exitCode = Math.max(exitCode, 1);
    }

    // 6. Generate audit doc (always, even on non-zero exit, so the user can
    // see which entries need decisions without re-running the tool).
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
      paragonBoardsByClass,
      glyphPool,
      paragonGlyphConflicts,
      bucketCoverage,
    });

    writeAuditDoc(auditDoc, build, docsDir, dryRun);

    // 7. Write files — skipped when exit code is non-zero to avoid overwriting
    // the existing catalog with an incomplete/partially-curated state.
    if (exitCode > 0) {
      console.warn(
        "[skip-writes] Catalog files NOT written (exit code non-zero). " +
        "Resolve all needs-curation entries in curation.json and re-run."
      );
      printSummary(affixSummary, aspectSummary, uniqueSummary, skillsByClass, paragonBoardsByClass, glyphPool);
      return { exitCode };
    }

    console.log(dryRun ? "[dry-run] Skipping file writes." : "Writing catalog files...");
    writeAffixes(affixSummary, verifiedAgainst, catalogRoot, dryRun);
    writeAspects(aspectSummary, verifiedAgainst, catalogRoot, dryRun);
    writeUniques(uniqueSummary, verifiedAgainst, catalogRoot, dryRun);
    writeSkills(skillsByClass, verifiedAgainst, catalogRoot, dryRun);
    writeParagon(paragonBoardsByClass, glyphPool, verifiedAgainst, catalogRoot, dryRun);

    // Print summary
    printSummary(affixSummary, aspectSummary, uniqueSummary, skillsByClass, paragonBoardsByClass, glyphPool);

    return { exitCode };
  } catch (err) {
    console.error("Fatal error during import:", err);
    return { exitCode: 2 };
  }
}

// ─── Disappeared entries check (D13) ─────────────────────────────────────────

/**
 * For each catalog entry that is absent from the new datamine output, decides:
 *   - "deprecated" curation → add to deprecatedAffixes / deprecatedAspects
 *     so the entry is emitted with deprecated:true (spec case 3)
 *   - "exclude" curation    → silently skip (no warning, intentionally removed)
 *   - no curation record    → add to warnings, caller sets exit code 1
 */
function collectDisappearedEntries(
  catalogRoot: string,
  newAffixIds: string[],
  newAspectIds: string[],
  curation: {
    affixes: Record<string, { action: string; catalogId?: string }>;
    aspects: Record<string, { action: string; catalogId?: string; source?: string }>;
  }
): {
  warnings: string[];
  deprecatedAffixes: AffixEntry[];
  deprecatedAspects: AspectEntry[];
} {
  const warnings: string[] = [];
  const deprecatedAffixes: AffixEntry[] = [];
  const deprecatedAspects: AspectEntry[] = [];

  // ── Affixes ────────────────────────────────────────────────────────────────
  const affixesPath = path.join(catalogRoot, "affixes.json");
  if (fs.existsSync(affixesPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(affixesPath, "utf8"));
      const existing: AffixEntry[] = data.affixes ?? [];
      const newIdSet = new Set(newAffixIds);

      for (const entry of existing) {
        if (newIdSet.has(entry.id)) continue; // still present
        const bnetFileName = findBnetFileNameForId(curation.affixes, entry.id);
        const record = bnetFileName ? curation.affixes[bnetFileName] : undefined;

        if (record?.action === "deprecated") {
          deprecatedAffixes.push({ ...entry, deprecated: true });
        } else if (record?.action === "exclude") {
          // Intentionally excluded — no warning needed
        } else {
          warnings.push(
            `Affix '${entry.id}' exists in catalog but was not found in new datamine import. ` +
            `Add a curation record (action: "deprecated" or "exclude") to resolve.`
          );
        }
      }
    } catch {
      // Ignore read errors on first run (catalog file may not exist yet)
    }
  }

  // ── Aspects ────────────────────────────────────────────────────────────────
  const aspectsPath = path.join(catalogRoot, "aspects.json");
  if (fs.existsSync(aspectsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(aspectsPath, "utf8"));
      const existing: AspectEntry[] = data.aspects ?? [];
      const newIdSet = new Set(newAspectIds);

      for (const entry of existing) {
        if (newIdSet.has(entry.id)) continue;
        const bnetFileName = findBnetFileNameForId(curation.aspects, entry.id);
        const record = bnetFileName ? curation.aspects[bnetFileName] : undefined;

        if (record?.action === "deprecated") {
          deprecatedAspects.push({ ...entry, deprecated: true });
        } else if (record?.action === "exclude") {
          // Intentionally excluded — no warning needed
        } else {
          warnings.push(
            `Aspect '${entry.id}' exists in catalog but was not found in new datamine import. ` +
            `Add a curation record (action: "deprecated" or "exclude") to resolve.`
          );
        }
      }
    } catch {
      // Ignore read errors on first run
    }
  }

  return { warnings, deprecatedAffixes, deprecatedAspects };
}

// ─── Bucket-coverage gate (D7, D8, D10, D11) ─────────────────────────────────

/**
 * Validates that every `eAttribute` appearing on affix and aspect catalog
 * entries has a corresponding entry in the bundled `lib/damage/config.json`
 * `attributeToBucket` map.
 *
 * Reads the bundled config JSON directly — NOT via `loadDamageConfig()` — so
 * per-deployment local overrides cannot mask a missing baseline entry (D11).
 *
 * Deprecated entries are included in the check (D10): a deprecated affix still
 * throws at `lib/damage/buckets.ts:65-71` when equipped on a saved character.
 *
 * Only affixes and aspects are checked (D8). Uniques and skills feed different
 * engine paths and do not go through `attributeToBucket`.
 */
function validateBucketCoverage(
  affixSummary: AffixTransformerSummary,
  aspectSummary: TransformerSummary<AspectEntry>
): BucketCoverageResult {
  // Keys starting with "_" are comments in the JSON, not attribute names.
  const rawConfig = bundledDamageConfig as { attributeToBucket: Record<string, unknown> };
  const mappedAttributes = new Set(
    Object.keys(rawConfig.attributeToBucket).filter((k) => !k.startsWith("_"))
  );

  const attributeToCatalogIds = new Map<string, string[]>();

  for (const entry of affixSummary.entries) {
    const attr = entry.attribute?.eAttribute;
    if (attr && !mappedAttributes.has(attr)) {
      const list = attributeToCatalogIds.get(attr) ?? [];
      list.push(entry.id);
      attributeToCatalogIds.set(attr, list);
    }
  }

  for (const entry of aspectSummary.entries) {
    const attr = entry.attribute?.eAttribute;
    if (attr && !mappedAttributes.has(attr)) {
      const list = attributeToCatalogIds.get(attr) ?? [];
      list.push(entry.id);
      attributeToCatalogIds.set(attr, list);
    }
  }

  const unmappedAttributes = Array.from(attributeToCatalogIds.entries()).map(
    ([attribute, catalogIds]) => ({ attribute, catalogIds })
  );

  return { unmappedAttributes };
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
  paragonBoardsByClass: Record<string, { entries: unknown[]; needsCuration: unknown[] }>,
  glyphPool: { entries: unknown[]; needsCuration: unknown[] }
): void {
  const totalSkills = Object.values(skillsByClass).reduce(
    (sum, s) => sum + s.entries.length,
    0
  );
  const totalBoards = Object.values(paragonBoardsByClass).reduce(
    (sum, p) => sum + p.entries.length,
    0
  );

  console.log("\nImport complete:");
  console.log(`  Affixes:  ${affixes.entries.length} imported, ${affixes.needsCuration.length} needs-curation, ${affixes.excluded.length} excluded`);
  console.log(`  Aspects:  ${aspects.entries.length} imported, ${aspects.needsCuration.length} needs-curation, ${aspects.excluded.length} excluded`);
  console.log(`  Uniques:  ${uniques.entries.length} imported, ${uniques.needsCuration.length} needs-curation, ${uniques.excluded.length} excluded`);
  console.log(`  Skills:   ${totalSkills} total across all classes`);
  console.log(`  Boards:   ${totalBoards} total across all classes`);
  console.log(`  Glyphs:   ${glyphPool.entries.length} pool entries, ${glyphPool.needsCuration.length} needs-curation`);
}
