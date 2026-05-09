/**
 * Datamine reader — reads raw JSON from the DiabloTools/d4data directory structure.
 */

import * as fs from "node:fs";
import * as path from "node:path";

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

/** Reads power definitions from json/base/meta/Power/ filtered by legendary aspect type */
export function loadAspects(datamineRoot: string): unknown[] {
  const all = readJsonDir(metaDir(datamineRoot, "Power"));
  return all.filter(
    (p) => (p as Record<string, unknown>)["ePowerType"] === "POWER_TYPE_LEGENDARY"
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
 * Reads string tables from json/enUS_Text/meta/StringList/ and builds
 * a Map<id, szLabel>.
 * Gracefully handles missing directories (returns empty map).
 */
export function loadStringTable(datamineRoot: string): Map<string, string> {
  const dir = stringListDir(datamineRoot);
  const files = readJsonDir(dir);
  const table = new Map<string, string>();

  for (const file of files) {
    const rec = file as Record<string, unknown>;
    const strings = rec["arStrings"];
    if (!Array.isArray(strings)) continue;

    for (const entry of strings) {
      const s = entry as Record<string, unknown>;
      if (typeof s["id"] === "string" && typeof s["szLabel"] === "string") {
        table.set(s["id"] as string, s["szLabel"] as string);
      }
    }
  }

  return table;
}
