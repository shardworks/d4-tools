/**
 * Paragon section transformer.
 *
 * Transforms raw ParagonBoard and ParagonGlyph data → catalog entries.
 */

import type { ParagonBoardEntry, ParagonGlyphEntry } from "../../../lib/catalog/index";
import type { CurationFile } from "../curation";
import { getCurationRecord, applyStrictHeuristics } from "../curation";
import { GLYPH_CLASS_ORDER } from "../mappings";
import type { TransformerSummary } from "./types";

// ─── Raw datamine shapes ──────────────────────────────────────────────────────

interface RawParagonBoard {
  __fileName__: string;
  __snoID__: number;
  bIsStarterBoard?: boolean;
}

interface RawParagonGlyph {
  __fileName__: string;
  __snoID__: number;
  fUsableByClass?: boolean[];
}

// ─── Transformers ─────────────────────────────────────────────────────────────

export function transformParagonBoards(
  rawBoards: unknown[],
  stringTable: Map<string, string>,
  curation: CurationFile
): TransformerSummary<ParagonBoardEntry> {
  const entries: ParagonBoardEntry[] = [];
  const needsCuration: Array<{ bnetFileName: string; reason: string }> = [];
  const deprecated: Array<{ bnetFileName: string; catalogId: string }> = [];
  const excluded: string[] = [];

  for (const raw of rawBoards) {
    const board = raw as RawParagonBoard;
    const fileName = board.__fileName__;
    const szLabel = stringTable.get(fileName) ?? "";

    const heuristic = applyStrictHeuristics({ fileName, szLabel });
    const curationRecord = getCurationRecord(curation, "paragonBoards", fileName);

    if (curationRecord) {
      if (curationRecord.action === "exclude") {
        excluded.push(fileName);
        continue;
      }
      if (curationRecord.action === "deprecated") {
        const catalogId = curationRecord.catalogId ?? `board_${fileName.toLowerCase()}`;
        deprecated.push({ bnetFileName: fileName, catalogId });
      }
    } else if (!heuristic.autoAccept) {
      needsCuration.push({ bnetFileName: fileName, reason: heuristic.reason ?? "unknown" });
      continue;
    } else {
      // Passes heuristics but not in curation → needs curation
      needsCuration.push({
        bnetFileName: fileName,
        reason: "no curation record for paragon board",
      });
      continue;
    }

    const catalogId = curationRecord?.catalogId ?? `board_${fileName.toLowerCase()}`;
    const label = curationRecord?.label ?? szLabel;

    const entry: ParagonBoardEntry = {
      id: catalogId,
      label,
      bnetId: board.__snoID__,
      bnetFileName: fileName,
    };

    if (board.bIsStarterBoard) {
      entry.isStarterBoard = true;
    }

    if (curationRecord?.legacyIds !== undefined) {
      entry.legacyIds = curationRecord.legacyIds;
    }

    entries.push(entry);
  }

  return { entries, needsCuration, deprecated, excluded };
}

/**
 * Transform glyphs for a specific class (by class name).
 * Filters by fUsableByClass bitmap for the given class.
 */
export function transformParagonGlyphsForClass(
  rawGlyphs: unknown[],
  stringTable: Map<string, string>,
  curation: CurationFile,
  className: string
): TransformerSummary<ParagonGlyphEntry> {
  const entries: ParagonGlyphEntry[] = [];
  const needsCuration: Array<{ bnetFileName: string; reason: string }> = [];
  const deprecated: Array<{ bnetFileName: string; catalogId: string }> = [];
  const excluded: string[] = [];

  const classIndex = GLYPH_CLASS_ORDER.indexOf(className);

  for (const raw of rawGlyphs) {
    const glyph = raw as RawParagonGlyph;
    const fileName = glyph.__fileName__;

    // Filter by class usability
    const usableByClass = glyph.fUsableByClass ?? [];
    if (classIndex >= 0 && usableByClass.length > classIndex) {
      if (!usableByClass[classIndex]) continue;
    }

    const szLabel = stringTable.get(fileName) ?? "";

    // Check if all-zero fUsableByClass (D17e)
    const allZero =
      usableByClass.length > 0 && usableByClass.every((v) => !v);

    const heuristic = applyStrictHeuristics({ fileName, szLabel });
    const curationRecord = getCurationRecord(curation, "paragonGlyphs", fileName);

    if (curationRecord) {
      if (curationRecord.action === "exclude") {
        excluded.push(fileName);
        continue;
      }
      if (curationRecord.action === "deprecated") {
        const catalogId = curationRecord.catalogId ?? `glyph_${fileName.toLowerCase()}`;
        deprecated.push({ bnetFileName: fileName, catalogId });
      }
    } else if (allZero) {
      needsCuration.push({ bnetFileName: fileName, reason: "all-zero fUsableByClass bitmap" });
      continue;
    } else if (!heuristic.autoAccept) {
      needsCuration.push({ bnetFileName: fileName, reason: heuristic.reason ?? "unknown" });
      continue;
    } else {
      needsCuration.push({
        bnetFileName: fileName,
        reason: "no curation record for paragon glyph",
      });
      continue;
    }

    const catalogId = curationRecord?.catalogId ?? `glyph_${fileName.toLowerCase()}`;
    const label = curationRecord?.label ?? szLabel;

    const entry: ParagonGlyphEntry = {
      id: catalogId,
      label,
      bnetId: glyph.__snoID__,
      bnetFileName: fileName,
    };

    if (curationRecord?.legacyIds !== undefined) {
      entry.legacyIds = curationRecord.legacyIds;
    }

    entries.push(entry);
  }

  return { entries, needsCuration, deprecated, excluded };
}

/**
 * Transform all paragon data for a given class (boards + glyphs).
 */
export function transformParagonForClass(
  rawBoards: unknown[],
  rawGlyphs: unknown[],
  stringTable: Map<string, string>,
  curation: CurationFile,
  className: string
): {
  boards: TransformerSummary<ParagonBoardEntry>;
  glyphs: TransformerSummary<ParagonGlyphEntry>;
} {
  // Filter boards by class name pattern (e.g. Paragon_Barb_ for Barbarian)
  const classKeyMap: Record<string, string[]> = {
    Barbarian: ["Barb"],
    Druid: ["Druid"],
    Necromancer: ["Necro"],
    Rogue: ["Rogue"],
    Sorcerer: ["Sorc"],
    Spiritborn: ["Spirit"],
    Paladin: ["Paladin"],
    Warlock: ["Warlock"],
  };

  const keys = classKeyMap[className] ?? [className];
  const filteredBoards = rawBoards.filter((raw) => {
    const b = raw as RawParagonBoard;
    return keys.some((k) => b.__fileName__?.includes(k));
  });

  const boards = transformParagonBoards(filteredBoards, stringTable, curation);
  const glyphs = transformParagonGlyphsForClass(rawGlyphs, stringTable, curation, className);

  return { boards, glyphs };
}
