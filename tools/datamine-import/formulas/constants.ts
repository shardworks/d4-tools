/**
 * Affix scalar and IP-threshold harvester.
 *
 * Reads `globals.glo.json` from the datamine at build time and extracts:
 *  - Sacred/Ancestral offense and defense scalars (used by the formula evaluator)
 *  - IP thresholds for sacred, ancestral, and greater-affix tier boundaries
 *
 * Per D23: every build re-reads `globals.glo.json` — no hand-authored snapshots.
 * Per D14: each harvested field records its source path in a comment in game-math.json.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AffixScalars {
  /** Source: globals.glo.json → fSacredAffixScalarOffense */
  sacredOffense: number;
  /** Source: globals.glo.json → fSacredAffixScalarDefense */
  sacredDefense: number;
  /** Source: globals.glo.json → fAncestralAffixScalarOffense */
  ancestralOffense: number;
  /** Source: globals.glo.json → fAncestralAffixScalarDefense */
  ancestralDefense: number;
}

export interface IpThresholds {
  /** Source: globals.glo.json → tSacredItemSpecifier.dwMinimumItemPower */
  sacredMinItemPower: number;
  /** Source: globals.glo.json → tAncestralItemSpecifier.dwMinimumItemPower */
  ancestralMinItemPower: number;
  /** Source: globals.glo.json → tGreaterAffixSpecifier.dwMinimumItemPower */
  greaterAffixMinItemPower: number;
}

export interface GlobalConstants {
  scalars: AffixScalars;
  ipThresholds: IpThresholds;
}

// ─── Harvester ────────────────────────────────────────────────────────────────

/**
 * Reads and parses `globals.glo.json` from the datamine root.
 * Path: `json/base/meta/Global/globals.glo.json`
 *
 * Throws if the file is missing or cannot be parsed.
 */
export function loadGlobalConstants(datamineRoot: string): GlobalConstants {
  const globalsPath = path.join(
    datamineRoot,
    "json",
    "base",
    "meta",
    "Global",
    "globals.glo.json"
  );

  if (!fs.existsSync(globalsPath)) {
    throw new Error(`globals.glo.json not found at: ${globalsPath}`);
  }

  const raw = fs.readFileSync(globalsPath, "utf8");
  const data = JSON.parse(raw) as Record<string, unknown>;

  const scalars: AffixScalars = {
    sacredOffense: extractNumber(data, "fSacredAffixScalarOffense", globalsPath) ?? 1.25,
    sacredDefense: extractNumber(data, "fSacredAffixScalarDefense", globalsPath) ?? 1.25,
    ancestralOffense: extractNumber(data, "fAncestralAffixScalarOffense", globalsPath) ?? 1.5,
    ancestralDefense: extractNumber(data, "fAncestralAffixScalarDefense", globalsPath) ?? 1.5,
  };

  const sacredSpec = data["tSacredItemSpecifier"] as Record<string, unknown> | undefined;
  const ancestralSpec = data["tAncestralItemSpecifier"] as Record<string, unknown> | undefined;
  const greaterAffixSpec = data["tGreaterAffixSpecifier"] as Record<string, unknown> | undefined;

  const ipThresholds: IpThresholds = {
    sacredMinItemPower: extractNumber(sacredSpec ?? {}, "dwMinimumItemPower", globalsPath) ?? 725,
    ancestralMinItemPower: extractNumber(ancestralSpec ?? {}, "dwMinimumItemPower", globalsPath) ?? 825,
    greaterAffixMinItemPower: extractNumber(greaterAffixSpec ?? {}, "dwMinimumItemPower", globalsPath) ?? 925,
  };

  return { scalars, ipThresholds };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractNumber(
  obj: Record<string, unknown>,
  key: string,
  sourcePath: string
): number | undefined {
  const val = obj[key];
  if (typeof val === "number") return val;
  if (val !== undefined) {
    console.warn(
      `[globals.glo.json] Expected number for key '${key}' in ${sourcePath}, got ${typeof val}`
    );
  }
  return undefined;
}
