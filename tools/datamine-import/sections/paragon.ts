/**
 * Paragon section transformer.
 *
 * Transforms raw ParagonBoard and ParagonGlyph data → catalog entries.
 *
 * Boards: per-class transformation (filtering by filename pattern).
 * Glyphs: single-pass shared-pool transformation (D5). Each raw glyph file is
 *   processed once; classAffinity is derived from fUsableByClass bitmap;
 *   results are grouped by catalogId into a shared ParagonGlyphPoolEntry per D3.
 */

import type { ParagonBoardEntry } from "../../../lib/catalog/index";
import type { CurationFile } from "../curation";
import { getCurationRecord, applyStrictHeuristics } from "../curation";
import { GLYPH_CLASS_ORDER } from "../mappings";
import { toBnetFileName } from "../file-name";
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

// ─── Shared pool entry shape (mirrors lib/catalog/paragon/glyphs.json) ────────

export interface ParagonGlyphPoolEntry {
  id: string;
  label: string;
  classAffinity: string[];
  labelByClass?: Record<string, string>;
  bnetSources: Record<string, { bnetId: number; bnetFileName: string }>;
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
    // See `toBnetFileName` docstring — raw is full path, fileName is basename.
    const rawFileName = board.__fileName__;
    const fileName = toBnetFileName(rawFileName);
    const szLabel = stringTable.get(rawFileName) ?? "";

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
 * Transform all paragon boards for a given class (filtered by filename pattern).
 */
export function transformParagonBoardsForClass(
  rawBoards: unknown[],
  stringTable: Map<string, string>,
  curation: CurationFile,
  className: string
): TransformerSummary<ParagonBoardEntry> {
  const classKeyMap: Record<string, string[]> = {
    Barbarian:   ["Barb"],
    Druid:       ["Druid"],
    Necromancer: ["Necro"],
    Rogue:       ["Rogue"],
    Sorcerer:    ["Sorc"],
    Spiritborn:  ["Spirit"],
    Paladin:     ["Paladin"],
    Warlock:     ["Warlock"],
  };

  const keys = classKeyMap[className] ?? [className];
  const filteredBoards = rawBoards.filter((raw) => {
    const b = raw as RawParagonBoard;
    return keys.some((k) => b.__fileName__?.includes(k));
  });

  return transformParagonBoards(filteredBoards, stringTable, curation);
}

/**
 * Single-pass glyph transformation (D5).
 *
 * Iterates all raw glyph files once. For each file:
 *   1. Resolves classAffinity from the fUsableByClass bitmap.
 *   2. Resolves catalogId and per-class label via curation lookup.
 *   3. Accumulates into a pool keyed by catalogId, merging bnetSources and labelByClass.
 *
 * Detects conflicts: two raw files mapping to the same catalogId with incompatible
 * same-class labels or deprecated+live collisions. Returns a non-empty `conflicts`
 * array when the dedup cannot resolve cleanly; the orchestrator exits non-zero (D12).
 */
export function transformParagonGlyphs(
  rawGlyphs: unknown[],
  stringTable: Map<string, string>,
  curation: CurationFile
): {
  pool: TransformerSummary<ParagonGlyphPoolEntry>;
  conflicts: Array<{ catalogId: string; reason: string }>;
} {
  const poolMap = new Map<string, ParagonGlyphPoolEntry>();
  const needsCuration: Array<{ bnetFileName: string; reason: string }> = [];
  const deprecated: Array<{ bnetFileName: string; catalogId: string }> = [];
  const excluded: string[] = [];
  const conflicts: Array<{ catalogId: string; reason: string }> = [];

  for (const raw of rawGlyphs) {
    const glyph = raw as RawParagonGlyph;
    // See `toBnetFileName` docstring — raw is full path, fileName is basename.
    const rawFileName = glyph.__fileName__;
    const fileName = toBnetFileName(rawFileName);
    const usableByClass = glyph.fUsableByClass ?? [];

    // Derive classAffinity from fUsableByClass bitmap
    const classAffinity: string[] = [];
    for (let i = 0; i < GLYPH_CLASS_ORDER.length; i++) {
      if (usableByClass.length > i && usableByClass[i]) {
        classAffinity.push(GLYPH_CLASS_ORDER[i]);
      }
    }

    // Check if all-zero fUsableByClass (D17e)
    const allZero =
      usableByClass.length > 0 && usableByClass.every((v) => !v);

    const szLabel = stringTable.get(rawFileName) ?? "";
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
        // Do not add deprecated entries to the pool
        continue;
      }
      // action === "include" — fall through to aggregation
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
    const resolvedLabel = curationRecord?.label ?? szLabel;

    // Aggregate into the pool entry for this catalogId
    const existing = poolMap.get(catalogId);

    if (!existing) {
      // First encounter for this catalogId
      const entry: ParagonGlyphPoolEntry = {
        id: catalogId,
        label: resolvedLabel,
        classAffinity: [...classAffinity],
        bnetSources: {},
      };
      for (const cls of classAffinity) {
        entry.bnetSources[cls] = { bnetId: glyph.__snoID__, bnetFileName: fileName };
      }
      poolMap.set(catalogId, entry);
    } else {
      // Merge into existing entry
      for (const cls of classAffinity) {
        if (existing.bnetSources[cls]) {
          // Conflict: two different files claim the same catalogId for the same class
          const conflict = `catalogId '${catalogId}' already has a bnetSource for class '${cls}' ` +
            `(existing: ${existing.bnetSources[cls].bnetFileName}, new: ${fileName})`;
          conflicts.push({ catalogId, reason: conflict });
        } else {
          existing.bnetSources[cls] = { bnetId: glyph.__snoID__, bnetFileName: fileName };
          if (!existing.classAffinity.includes(cls)) {
            existing.classAffinity.push(cls);
          }
        }
      }

      // Check for label divergence: if the resolved label differs from the
      // default label, record it in labelByClass for each class in this file.
      if (resolvedLabel !== existing.label) {
        if (!existing.labelByClass) {
          existing.labelByClass = {};
        }
        for (const cls of classAffinity) {
          const existingClassLabel = existing.labelByClass[cls];
          if (existingClassLabel !== undefined && existingClassLabel !== resolvedLabel) {
            // Two different files give the same class different labels for the same catalogId
            conflicts.push({
              catalogId,
              reason: `Class '${cls}' has conflicting labels for catalogId '${catalogId}': ` +
                `'${existingClassLabel}' vs '${resolvedLabel}'`,
            });
          } else {
            existing.labelByClass[cls] = resolvedLabel;
          }
        }
      }
    }
  }

  // Post-process: remove labelByClass entries that match the default label
  // (only keep true divergences)
  for (const entry of poolMap.values()) {
    if (entry.labelByClass) {
      for (const cls of Object.keys(entry.labelByClass)) {
        if (entry.labelByClass[cls] === entry.label) {
          delete entry.labelByClass[cls];
        }
      }
      if (Object.keys(entry.labelByClass).length === 0) {
        delete entry.labelByClass;
      }
    }
  }

  const entries = Array.from(poolMap.values());
  return {
    pool: { entries, needsCuration, deprecated, excluded },
    conflicts,
  };
}

/**
 * Transform all paragon data for a given class (boards only).
 * Glyphs are now a shared pool; use transformParagonGlyphs() for the single pass.
 */
export function transformParagonForClass(
  rawBoards: unknown[],
  rawGlyphs: unknown[],
  stringTable: Map<string, string>,
  curation: CurationFile,
  className: string
): {
  boards: TransformerSummary<ParagonBoardEntry>;
} {
  void rawGlyphs; // glyphs handled by single-pass transformParagonGlyphs()
  const boards = transformParagonBoardsForClass(rawBoards, stringTable, curation, className);
  return { boards };
}
