/**
 * Catalog file writer.
 *
 * Writes transformed catalog entries to the appropriate JSON files.
 * When dryRun is true, no files are written.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AffixEntry,
  AspectEntry,
  SkillEntry,
  ParagonBoardEntry,
  VerifiedAgainst,
} from "../../lib/catalog/index";
import type { UniqueEntry } from "../../lib/catalog/index";
import type { TransformerSummary } from "./sections/types";
import type { ParagonGlyphPoolEntry } from "./sections/paragon";
import {
  serializeAffix,
  serializeAspect,
  serializeUnique,
  serializeSkill,
  serializeBoard,
  sortByBnetFileName,
  toJson,
} from "./serialize";

// ─── Writers ──────────────────────────────────────────────────────────────────

export function writeAffixes(
  summary: TransformerSummary<AffixEntry>,
  verifiedAgainst: VerifiedAgainst,
  outDir: string,
  dryRun: boolean
): void {
  if (dryRun) return;

  const sorted = sortByBnetFileName(summary.entries);
  const payload = {
    verifiedAgainst,
    affixes: sorted.map(serializeAffix),
  };

  const filePath = path.join(outDir, "affixes.json");
  fs.writeFileSync(filePath, toJson(payload), "utf8");
}

export function writeAspects(
  summary: TransformerSummary<AspectEntry>,
  verifiedAgainst: VerifiedAgainst,
  outDir: string,
  dryRun: boolean
): void {
  if (dryRun) return;

  const sorted = sortByBnetFileName(summary.entries);
  const payload = {
    verifiedAgainst,
    aspects: sorted.map(serializeAspect),
  };

  const filePath = path.join(outDir, "aspects.json");
  fs.writeFileSync(filePath, toJson(payload), "utf8");
}

export function writeUniques(
  summary: TransformerSummary<UniqueEntry>,
  verifiedAgainst: VerifiedAgainst,
  outDir: string,
  dryRun: boolean
): void {
  if (dryRun) return;

  const sorted = sortByBnetFileName(summary.entries);
  const payload = {
    verifiedAgainst,
    uniques: sorted.map(serializeUnique),
  };

  const filePath = path.join(outDir, "uniques.json");
  fs.writeFileSync(filePath, toJson(payload), "utf8");
}

export function writeSkills(
  classSections: Record<string, TransformerSummary<SkillEntry>>,
  verifiedAgainst: VerifiedAgainst,
  outDir: string,
  dryRun: boolean
): void {
  if (dryRun) return;

  const skillsDir = path.join(outDir, "skills");
  fs.mkdirSync(skillsDir, { recursive: true });

  for (const [className, summary] of Object.entries(classSections)) {
    const sorted = sortByBnetFileName(summary.entries);
    const payload = {
      verifiedAgainst,
      skills: sorted.map(serializeSkill),
    };

    const filePath = path.join(skillsDir, `${className}.json`);
    fs.writeFileSync(filePath, toJson(payload), "utf8");
  }
}

/**
 * Write paragon output:
 *   - `paragon/glyphs.json` — the shared glyph pool (D3, D5).
 *   - `paragon/{Class}.json` — boards only; no `glyphs` key (D6).
 */
export function writeParagon(
  classBoardSections: Record<string, TransformerSummary<ParagonBoardEntry>>,
  glyphPool: TransformerSummary<ParagonGlyphPoolEntry>,
  verifiedAgainst: VerifiedAgainst,
  outDir: string,
  dryRun: boolean
): void {
  if (dryRun) return;

  const paragonDir = path.join(outDir, "paragon");
  fs.mkdirSync(paragonDir, { recursive: true });

  // Write the shared glyph pool
  const sortedGlyphs = [...glyphPool.entries].sort((a, b) => a.id.localeCompare(b.id));
  const glyphPayload = {
    glyphs: sortedGlyphs.map(serializeGlyphPoolEntry),
  };
  const glyphFilePath = path.join(paragonDir, "glyphs.json");
  fs.writeFileSync(glyphFilePath, toJson(glyphPayload), "utf8");

  // Write per-class files with boards only (no glyphs key per D6)
  for (const [className, boards] of Object.entries(classBoardSections)) {
    const sortedBoards = sortByBnetFileName(boards.entries);
    const payload = {
      class: className,
      verifiedAgainst,
      boards: sortedBoards.map(serializeBoard),
    };

    const filePath = path.join(paragonDir, `${className}.json`);
    fs.writeFileSync(filePath, toJson(payload), "utf8");
  }
}

// ─── Pool serializer ──────────────────────────────────────────────────────────

function serializeGlyphPoolEntry(entry: ParagonGlyphPoolEntry): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: entry.id,
    label: entry.label,
    classAffinity: entry.classAffinity,
  };
  if (entry.labelByClass && Object.keys(entry.labelByClass).length > 0) {
    obj.labelByClass = entry.labelByClass;
  }
  obj.bnetSources = entry.bnetSources;
  return obj;
}
