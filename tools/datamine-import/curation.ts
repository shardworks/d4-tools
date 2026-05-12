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
   * For aspects: the [min, max] value range to use in the catalog.
   * @deprecated For affixes, use `manualValueRanges` instead (formula-driven pipeline).
   * Required for aspects when the aspect transformer cannot derive a range automatically.
   */
  valueRange?: [number, number];
  /**
   * For affixes: per-IP-tier manual value bands, used as a fallback when the
   * formula chain evaluates to zero or empty (D11 implicit fallback).
   * Required for implicit affixes whose formula yields no useful range.
   * Each band: { minItemPower, min, max }, sorted ascending by minItemPower.
   */
  manualValueRanges?: Array<{ minItemPower: number; min: number; max: number }>;
  /**
   * For affixes: true when this affix is an implicit property built in to the
   * item type (e.g. resistance on jewelry). Used for D11/D12 implicit fallback logic.
   * When true and the formula chain yields zero, manualValueRanges is required.
   */
  isImplicit?: boolean;
  /**
   * For affixes and aspects: whether the value is a percentage (true) or a
   * flat numeric value (false). Overrides the auto-detected isPercent from
   * the attribute name and label heuristics.
   */
  isPercent?: boolean;
  /**
   * Ids previously used for this catalog entry (skills, paragon boards, or paragon glyphs).
   * Threads through the transformer and serializer into the catalog JSON so that
   * `findById` can still resolve saved character data that carries an old id.
   * Set when an audit-driven label change renames the catalog id.
   */
  legacyIds?: string[];
  /**
   * v19 (D2): For weapon-damage implicit affixes — the speed class of the weapon type.
   * Determines base APS for the damage engine. Absent on all other affixes.
   * VeryFast: 1HDagger, 1HFlail, 1HFocus, 1HWand
   * Fast: 1HAxe, 1HMace, 1HScythe, 1HSword, 1HTotem, 2HBow, 2HQuarterstaff
   * Normal: 2HGlaive, 2HStaff, 2HSword
   * Slow: 2HAxe, 2HCrossbow, 2HMace, 2HPolearm, 2HScythe
   */
  weaponSpeedClass?: "VeryFast" | "Fast" | "Normal" | "Slow";
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
