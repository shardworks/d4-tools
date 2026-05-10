/**
 * Curation file loader and action enum.
 *
 * The curation file is the editorial override layer for the datamine import pipeline.
 * It maps datamine bnetFileName → action + optional overrides.
 */

import * as fs from "node:fs";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CurationAction = "include" | "exclude" | "deprecated";

export interface CurationRecord {
  action: CurationAction;
  catalogId?: string;
  label?: string;
  reason?: string;
  /**
   * For aspects: source override. Without this field the transformer defaults
   * to "legendary". Set to "codex" to preserve codex aspects across reruns.
   */
  source?: "legendary" | "codex";
  /** For skills: category override (datamine has no category field) */
  category?: string;
  /** For skills: maxRank override */
  maxRank?: number;
  /**
   * v15 — For aspects: true when this aspect is a [×]-tagged distinct multiplicative
   * source in-game (D16). Set via curation; not derivable from the datamine alone
   * since the [×] tag appears only in the in-game tooltip.
   */
  isDistinctMultiplier?: boolean;
  /**
   * For affixes and aspects: the [min, max] value range to use in the catalog.
   * Required when the datamine formula cannot produce a simple numeric range
   * (e.g. complex formulas, level-scaled values). When absent the transformer
   * pushes the entry to needsCuration with reason "no-value-range".
   */
  valueRange?: [number, number];
  /**
   * For affixes and aspects: whether the value is a percentage (true) or a
   * flat numeric value (false). Overrides the auto-detected isPercent from
   * the attribute name and label heuristics.
   */
  isPercent?: boolean;
}

export interface CurationFile {
  affixes: Record<string, CurationRecord>;
  aspects: Record<string, CurationRecord>;
  skills: Record<string, CurationRecord>;
  paragonBoards: Record<string, CurationRecord>;
  paragonGlyphs: Record<string, CurationRecord>;
  uniques: Record<string, CurationRecord>;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

/** Reads and parses the curation JSON file */
export function loadCuration(filePath: string): CurationFile {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<CurationFile>;
  return {
    affixes: parsed.affixes ?? {},
    aspects: parsed.aspects ?? {},
    skills: parsed.skills ?? {},
    paragonBoards: parsed.paragonBoards ?? {},
    paragonGlyphs: parsed.paragonGlyphs ?? {},
    uniques: parsed.uniques ?? {},
  };
}

/** Gets a curation record for a given section and bnetFileName */
export function getCurationRecord(
  curation: CurationFile,
  section: keyof CurationFile,
  bnetFileName: string
): CurationRecord | undefined {
  return curation[section][bnetFileName];
}

// ─── Strict heuristics (D17) ──────────────────────────────────────────────────

export interface StrictHeuristicsResult {
  autoAccept: boolean;
  reason?: string;
}

/**
 * Applies strict heuristics to determine if an entry should be auto-flagged
 * for curation (D17).
 *
 * Returns autoAccept: false with a reason if the entry should be flagged.
 * Returns autoAccept: true if the entry passes all heuristics.
 */
export function applyStrictHeuristics(entry: {
  fileName: string;
  szLabel: string;
  [key: string]: unknown;
}): StrictHeuristicsResult {
  // D17a: WIP/empty label
  if (!entry.szLabel || entry.szLabel.startsWith("[WIP]")) {
    return { autoAccept: false, reason: "WIP/empty label" };
  }

  // D17d: _OLD/_WIP/_dev/_test/_legacy suffix in fileName
  const badSuffixes = ["_OLD", "_WIP", "_dev", "_test", "_legacy"];
  for (const suffix of badSuffixes) {
    if (entry.fileName.includes(suffix)) {
      return {
        autoAccept: false,
        reason: `_OLD/_WIP/_dev/_test/_legacy suffix`,
      };
    }
  }

  return { autoAccept: true };
}
