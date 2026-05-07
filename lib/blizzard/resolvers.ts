/**
 * Shared resolver primitive (D10).
 *
 * Creates a lookup function parameterized over a catalog array and entity type.
 * Resolution is ID-only (D9 patron override) — no display-string fallback.
 * Unresolved entities get an "unresolved:<id>" prefix (D14).
 *
 * Usage:
 *   const resolveAffix = makeResolver(affixes);
 *   const result = resolveAffix(334512);
 *   if (result.isUnresolved) banner.warn("unresolved:" + result.unresolvedKey);
 */

import type {
  AffixEntry,
  AspectEntry,
  SkillEntry,
  ParagonBoardEntry,
  ParagonGlyphEntry,
  ClassEntry,
  SlotEntry,
} from "@/lib/catalog";

// ─── Generic resolver primitive ────────────────────────────────────────────

/** Catalog entries that carry optional bnet IDs (D28). */
export interface BnetMappable {
  id: string;
  bnetId?: number;
  bnetFileName?: string;
}

export interface ResolverHit<T extends BnetMappable> {
  entry: T;
  isUnresolved: false;
}

export interface ResolverMiss {
  entry: null;
  isUnresolved: true;
  /** The raw ID that could not be resolved, for use in "unresolved:<id>" prefix (D14). */
  unresolvedKey: string;
}

export type ResolverResult<T extends BnetMappable> = ResolverHit<T> | ResolverMiss;

/**
 * Build a resolver for a catalog array.
 * Indexes by bnetId (numeric) and bnetFileName (string) for O(1) lookups.
 *
 * The resolver accepts either a numeric sno ID or a string fileName.
 */
export function makeResolver<T extends BnetMappable>(
  catalog: T[]
): (apiId: number | string) => ResolverResult<T> {
  const byBnetId = new Map<number, T>();
  const byBnetFileName = new Map<string, T>();

  for (const entry of catalog) {
    if (entry.bnetId != null) byBnetId.set(entry.bnetId, entry);
    if (entry.bnetFileName != null) byBnetFileName.set(entry.bnetFileName, entry);
  }

  return (apiId: number | string): ResolverResult<T> => {
    let resolved: T | undefined;

    if (typeof apiId === "number") {
      resolved = byBnetId.get(apiId);
    } else {
      // Try as string fileName first
      resolved = byBnetFileName.get(apiId);
      // Also try as numeric (D9: id-only; a string "334512" should match bnetId 334512)
      if (!resolved) {
        const asNum = Number(apiId);
        if (!isNaN(asNum)) resolved = byBnetId.get(asNum);
      }
    }

    if (resolved) {
      return { entry: resolved, isUnresolved: false };
    }

    return {
      entry: null,
      isUnresolved: true,
      unresolvedKey: `unresolved:${apiId}`,
    };
  };
}

// ─── Per-entity resolvers ──────────────────────────────────────────────────

/**
 * Build all entity resolvers from the loaded catalog data.
 *
 * Usage:
 *   const resolvers = buildResolvers(catalog);
 *   const hit = resolvers.affix(334512);
 */
export interface CatalogResolvers {
  affix: (id: number | string) => ResolverResult<AffixEntry>;
  aspect: (id: number | string) => ResolverResult<AspectEntry>;
  skill: (id: number | string) => ResolverResult<SkillEntry>;
  board: (id: number | string) => ResolverResult<ParagonBoardEntry>;
  glyph: (id: number | string) => ResolverResult<ParagonGlyphEntry>;
  class: (id: number | string) => ResolverResult<ClassEntry & BnetMappable>;
  slot: (bnetSlotKey: string) => SlotEntry | null;
}

export interface CatalogForResolvers {
  affixes: AffixEntry[];
  aspects: AspectEntry[];
  skills: SkillEntry[];
  boards: ParagonBoardEntry[];
  glyphs: ParagonGlyphEntry[];
  classes: ClassEntry[];
  slots: SlotEntry[];
}

export function buildResolvers(catalog: CatalogForResolvers): CatalogResolvers {
  // ClassEntry has bnetClassName (string) and bnetClassId (number); map both
  const classByBnetClassName = new Map<string, ClassEntry>();
  const classByBnetClassId = new Map<number, ClassEntry>();
  for (const cls of catalog.classes) {
    if (cls.bnetClassName) classByBnetClassName.set(cls.bnetClassName, cls);
    if (cls.bnetClassId != null) classByBnetClassId.set(cls.bnetClassId, cls);
  }

  const classResolver = (id: number | string): ResolverResult<ClassEntry & BnetMappable> => {
    let resolved: ClassEntry | undefined;
    if (typeof id === "number") {
      resolved = classByBnetClassId.get(id);
    } else {
      resolved = classByBnetClassName.get(id.toLowerCase());
      if (!resolved) {
        const asNum = Number(id);
        if (!isNaN(asNum)) resolved = classByBnetClassId.get(asNum);
      }
    }
    if (resolved) return { entry: resolved as ClassEntry & BnetMappable, isUnresolved: false };
    return { entry: null, isUnresolved: true, unresolvedKey: `unresolved:${id}` };
  };

  // Slot lookup by bnetSlotKey
  const slotByBnetKey = new Map<string, SlotEntry>();
  for (const slot of catalog.slots) {
    if (slot.bnetSlotKey) slotByBnetKey.set(slot.bnetSlotKey, slot);
  }

  return {
    affix: makeResolver(catalog.affixes),
    aspect: makeResolver(catalog.aspects),
    skill: makeResolver(catalog.skills),
    board: makeResolver(catalog.boards),
    glyph: makeResolver(catalog.glyphs),
    class: classResolver,
    slot: (key: string) => slotByBnetKey.get(key) ?? null,
  };
}
