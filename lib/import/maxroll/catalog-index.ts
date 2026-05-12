/**
 * Catalog join-index builders for the Maxroll importer (T3).
 *
 * Builds Map<bnetFileName, CatalogEntry> indices from the global catalog arrays.
 * Called once at module load (lazy via `getCatalogIndex()`); results are memoized.
 *
 * Per D4 (brief decision): bnetFileName is the ONLY join key — no label-match,
 * no attribute-id, no tag-heuristic fallbacks.
 */

import {
  affixes,
  aspects,
  uniques,
  classes,
  getSkillsForClass,
  getParagonCatalogForClass,
  type AffixEntry,
  type AspectEntry,
  type UniqueEntry,
  type SkillEntry,
  type ParagonBoardEntry,
  type ParagonGlyphEntry,
} from "@/lib/catalog";

export interface CatalogIndex {
  /** Map from bnetFileName → AffixEntry (non-deprecated entries only). */
  affixByBnetFileName: Map<string, AffixEntry>;
  /** Map from bnetFileName → AspectEntry (non-deprecated entries only). */
  aspectByBnetFileName: Map<string, AspectEntry>;
  /** Map from bnetFileName → UniqueEntry. */
  uniqueByBnetFileName: Map<string, UniqueEntry>;
  /** Per-class skill maps keyed by bnetFileName. */
  skillsByClass: Map<string, Map<string, SkillEntry>>;
  /** Per-class paragon board maps keyed by bnetFileName. */
  paragonBoardsByClass: Map<string, Map<string, ParagonBoardEntry>>;
  /** Per-class paragon glyph maps keyed by bnetFileName. */
  paragonGlyphsByClass: Map<string, Map<string, ParagonGlyphEntry>>;
}

let _index: CatalogIndex | undefined;

export function getCatalogIndex(): CatalogIndex {
  if (_index) return _index;

  // Affix index
  const affixByBnetFileName = new Map<string, AffixEntry>();
  for (const entry of affixes) {
    if (!entry.deprecated && entry.bnetFileName) {
      affixByBnetFileName.set(entry.bnetFileName, entry);
    }
  }

  // Aspect index
  const aspectByBnetFileName = new Map<string, AspectEntry>();
  for (const entry of aspects) {
    if (!entry.deprecated && entry.bnetFileName) {
      aspectByBnetFileName.set(entry.bnetFileName, entry);
    }
  }

  // Unique index
  const uniqueByBnetFileName = new Map<string, UniqueEntry>();
  for (const entry of uniques) {
    if (!entry.deprecated && entry.bnetFileName) {
      uniqueByBnetFileName.set(entry.bnetFileName, entry);
    }
  }

  // Per-class skill/board/glyph indices
  const skillsByClass = new Map<string, Map<string, SkillEntry>>();
  const paragonBoardsByClass = new Map<string, Map<string, ParagonBoardEntry>>();
  const paragonGlyphsByClass = new Map<string, Map<string, ParagonGlyphEntry>>();

  for (const cls of classes) {
    const className = cls.id;

    // Skills
    const skillMap = new Map<string, SkillEntry>();
    for (const entry of getSkillsForClass(className)) {
      if (entry.bnetFileName) skillMap.set(entry.bnetFileName, entry);
    }
    skillsByClass.set(className, skillMap);

    // Paragon boards + glyphs
    const { boards, glyphs } = getParagonCatalogForClass(className);

    const boardMap = new Map<string, ParagonBoardEntry>();
    for (const board of boards) {
      if (board.bnetFileName) boardMap.set(board.bnetFileName, board);
    }
    paragonBoardsByClass.set(className, boardMap);

    const glyphMap = new Map<string, ParagonGlyphEntry>();
    for (const glyph of glyphs) {
      if (glyph.bnetFileName) glyphMap.set(glyph.bnetFileName, glyph);
    }
    paragonGlyphsByClass.set(className, glyphMap);
  }

  _index = {
    affixByBnetFileName,
    aspectByBnetFileName,
    uniqueByBnetFileName,
    skillsByClass,
    paragonBoardsByClass,
    paragonGlyphsByClass,
  };
  return _index;
}

/** Clear the singleton index (used in tests that need a fresh state). */
export function clearCatalogIndex(): void {
  _index = undefined;
}
