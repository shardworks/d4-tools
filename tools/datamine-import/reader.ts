/**
 * Datamine reader — reads raw JSON from the DiabloTools/d4data directory structure.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { FormulaRecord } from "./formulas/index";
import { loadFormulas } from "./formulas/index";
import { loadGlobalConstants } from "./formulas/constants";
import type { GlobalConstants } from "./formulas/constants";

// ─── Path helpers ─────────────────────────────────────────────────────────────

/** Returns the base/meta/<Section>/ path within the datamine root */
export function metaDir(datamineRoot: string, section: string): string {
  return path.join(datamineRoot, "json", "base", "meta", section);
}

/** Returns the enUS_Text/meta/StringList/ path within the datamine root */
export function stringListDir(datamineRoot: string): string {
  return path.join(datamineRoot, "json", "enUS_Text", "meta", "StringList");
}

// ─── Generic directory reader ─────────────────────────────────────────────────

/**
 * Reads all JSON files from a directory and returns array of parsed objects.
 * Gracefully handles missing directories by returning an empty array.
 */
export function readJsonDir(dirPath: string): unknown[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath);
  const results: unknown[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const filePath = path.join(dirPath, entry);
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      results.push(JSON.parse(raw));
    } catch {
      // Skip malformed JSON files silently
    }
  }

  return results;
}

// ─── Section-specific loaders ─────────────────────────────────────────────────

/** Reads affix definitions from json/base/meta/Affix/ */
export function loadAffixes(datamineRoot: string): unknown[] {
  return readJsonDir(metaDir(datamineRoot, "Affix"));
}

/**
 * Reads legendary aspect definitions from json/base/meta/Affix/ filtered by
 * eAffixType === 1 (legendary). Power files do NOT contain ePowerType and are
 * not used for aspects.
 */
export function loadAspects(datamineRoot: string): unknown[] {
  const all = readJsonDir(metaDir(datamineRoot, "Affix"));
  return all.filter(
    (p) => (p as Record<string, unknown>)["eAffixType"] === 1
  );
}

/** Reads all power definitions from json/base/meta/Power/ (unfiltered) */
export function loadAllPowers(datamineRoot: string): unknown[] {
  return readJsonDir(metaDir(datamineRoot, "Power"));
}

/** Reads SkillKit entries from json/base/meta/SkillKit/, returns map of filename→entries */
export function loadSkillKits(datamineRoot: string): Map<string, unknown> {
  const all = readJsonDir(metaDir(datamineRoot, "SkillKit"));
  const map = new Map<string, unknown>();
  for (const entry of all) {
    const rec = entry as Record<string, unknown>;
    if (typeof rec["__fileName__"] === "string") {
      map.set(rec["__fileName__"] as string, entry);
    }
  }
  return map;
}

/** Reads paragon boards from json/base/meta/ParagonBoard/ */
export function loadParagonBoards(datamineRoot: string): unknown[] {
  return readJsonDir(metaDir(datamineRoot, "ParagonBoard"));
}

/** Reads paragon glyphs from json/base/meta/ParagonGlyph/ */
export function loadParagonGlyphs(datamineRoot: string): unknown[] {
  return readJsonDir(metaDir(datamineRoot, "ParagonGlyph"));
}

/** Reads item definitions from json/base/meta/Item/ */
export function loadItems(datamineRoot: string): unknown[] {
  return readJsonDir(metaDir(datamineRoot, "Item"));
}

/**
 * Loads the formula table from `json/base/meta/GameBalance/AttributeFormulas.gam.json`.
 * Returns a Map<formulaName → FormulaRecord> for O(1) lookup in the affix transformer.
 * Returns an empty map if the file does not exist.
 */
export function loadAttributeFormulas(datamineRoot: string): Map<string, FormulaRecord> {
  return loadFormulas(datamineRoot);
}

/**
 * Loads global constants (Sacred/Ancestral scalars and IP thresholds) from
 * `json/base/meta/Global/globals.glo.json`.
 * Throws if the file is missing.
 */
export function loadGlobals(datamineRoot: string): GlobalConstants {
  return loadGlobalConstants(datamineRoot);
}

/**
 * Reads string tables from json/enUS_Text/meta/StringList/ and builds
 * a flat Map<key, szText> where:
 *
 * 1. For each Section_Basename.stl.json file, a primary entry is stored:
 *      key = "base/meta/{Section}/{Basename}.{ext}"  →  value = "Name" szText
 *    This allows skills.ts and paragon.ts to do stringTable.get(fileName)
 *    using the base-data __fileName__ field as the lookup key.
 *
 * 2. For Affix_*.stl.json and Item_*.stl.json files, additional per-label
 *    entries are stored using a "::" separator:
 *      key = "base/meta/Affix/{Basename}.aff::{szLabel}"  →  szText
 *      key = "base/meta/Item/{Basename}.itm::{szLabel}"   →  szText
 *    Affix and item section transformers use stringTable.get(fileName + "::" + label)
 *    to retrieve label-specific strings (e.g. "Desc", "Name", "Name_Prefix").
 *
 * Gracefully handles missing directories (returns empty map).
 */
export function loadStringTable(datamineRoot: string): Map<string, string> {
  const dir = stringListDir(datamineRoot);
  const table = new Map<string, string>();

  if (!fs.existsSync(dir)) {
    return table;
  }

  const entries = fs.readdirSync(dir);

  for (const entry of entries) {
    if (!entry.endsWith(".stl.json")) continue;

    const filePath = path.join(dir, entry);
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      continue;
    }

    const rec = parsed as Record<string, unknown>;
    const arStrings = rec["arStrings"];
    if (!Array.isArray(arStrings)) continue;

    // Build a label→text map for this stl file.
    const labelMap = new Map<string, string>();
    for (const s of arStrings) {
      const entry2 = s as Record<string, unknown>;
      if (typeof entry2["szLabel"] === "string" && typeof entry2["szText"] === "string") {
        labelMap.set(entry2["szLabel"] as string, entry2["szText"] as string);
      }
    }

    // Derive the base-file path key from the stl filename.
    // stl filename pattern: {SectionPrefix}_{Basename}.stl.json
    // e.g. Affix_Life.stl.json → section=Affix, basename=Life, ext=.aff
    //      Item_1HAxe_Unique_Druid_100.stl.json → section=Item, basename=1HAxe_Unique_Druid_100, ext=.itm
    //      ParagonBoard_Paragon_Barb_00.stl.json → section=ParagonBoard, basename=Paragon_Barb_00, ext=.pbd
    //      ParagonGlyph_Rare_001_Intelligence_Main.stl.json → section=ParagonGlyph, basename=Rare_001_Intelligence_Main, ext=.gph
    const stlBase = entry.replace(/\.stl\.json$/, "");

    let section: string | undefined;
    let basename: string | undefined;
    let ext: string | undefined;

    if (stlBase.startsWith("Affix_")) {
      section = "Affix";
      basename = stlBase.slice("Affix_".length);
      ext = ".aff";
    } else if (stlBase.startsWith("Item_")) {
      section = "Item";
      basename = stlBase.slice("Item_".length);
      ext = ".itm";
    } else if (stlBase.startsWith("ParagonBoard_")) {
      section = "ParagonBoard";
      basename = stlBase.slice("ParagonBoard_".length);
      ext = ".pbd";
    } else if (stlBase.startsWith("ParagonGlyph_")) {
      section = "ParagonGlyph";
      basename = stlBase.slice("ParagonGlyph_".length);
      ext = ".gph";
    } else if (stlBase.startsWith("Power_")) {
      section = "Power";
      basename = stlBase.slice("Power_".length);
      ext = ".pow";
    } else if (stlBase.startsWith("SkillKit_")) {
      section = "SkillKit";
      basename = stlBase.slice("SkillKit_".length);
      ext = ".skl";
    } else {
      // Unknown prefix — skip or store without structured key
      continue;
    }

    // Primary key: "base/meta/{Section}/{Basename}.{ext}" → "Name" szText
    // Used by skills.ts and paragon.ts via stringTable.get(fileName).
    const baseFileKey = `base/meta/${section}/${basename}${ext}`;
    const nameText = labelMap.get("Name") ?? "";
    table.set(baseFileKey, nameText);

    // Per-label keys for Affix and Item sections.
    // Transformers use: stringTable.get(fileName + "::" + szLabel)
    if (section === "Affix" || section === "Item") {
      for (const [label, text] of labelMap) {
        table.set(`${baseFileKey}::${label}`, text);
      }
    }
  }

  return table;
}
