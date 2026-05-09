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
  ParagonGlyphEntry,
  VerifiedAgainst,
} from "../../lib/catalog/index";
import type { UniqueEntry } from "../../lib/catalog/index";
import type { TransformerSummary } from "./sections/types";
import {
  serializeAffix,
  serializeAspect,
  serializeUnique,
  serializeSkill,
  serializeBoard,
  serializeGlyph,
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

export function writeParagon(
  classSections: Record<
    string,
    {
      boards: TransformerSummary<ParagonBoardEntry>;
      glyphs: TransformerSummary<ParagonGlyphEntry>;
    }
  >,
  verifiedAgainst: VerifiedAgainst,
  outDir: string,
  dryRun: boolean
): void {
  if (dryRun) return;

  const paragonDir = path.join(outDir, "paragon");
  fs.mkdirSync(paragonDir, { recursive: true });

  for (const [className, { boards, glyphs }] of Object.entries(classSections)) {
    const sortedBoards = sortByBnetFileName(boards.entries);
    const sortedGlyphs = sortByBnetFileName(glyphs.entries);

    const payload = {
      verifiedAgainst,
      boards: sortedBoards.map(serializeBoard),
      glyphs: sortedGlyphs.map(serializeGlyph),
    };

    const filePath = path.join(paragonDir, `${className}.json`);
    fs.writeFileSync(filePath, toJson(payload), "utf8");
  }
}
