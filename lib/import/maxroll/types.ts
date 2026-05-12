/**
 * Public types for the Maxroll planner importer.
 *
 * ImportResult is a discriminated union:
 *   { ok: true, ... }  — success (possibly with warnings)
 *   { ok: false, ... } — hard failure
 *
 * UnmappedRef is a per-category discriminated union carrying the identifying
 * fields present in Maxroll's payload for each category (D8).
 */

import type { Character } from "@/lib/schema/character";
import type { Build } from "@/lib/schema/build";
import type { Item } from "@/lib/schema/item";

// ─── Unmapped reference shape (D8) ────────────────────────────────────────────

export type UnmappedRef =
  | {
      category: "affix";
      /** Maxroll nid (numeric stat id as string). */
      nid: string;
      /** Maxroll item slot where the unmapped affix appeared. */
      itemSlot: string;
    }
  | {
      category: "aspect";
      /** Maxroll aspect id. */
      id: string;
      /** Maxroll bnetFileName if present in the payload. */
      bnetFileName?: string;
    }
  | {
      category: "paragon-node";
      /** Maxroll paragon node id. */
      nodeId: string | number;
      /** Board label where this node appeared. */
      boardLabel?: string;
    }
  | {
      category: "glyph";
      /** Maxroll glyph id. */
      glyphId: string | number;
      /** Maxroll bnetFileName for the glyph if present. */
      bnetFileName?: string;
    }
  | {
      category: "skill";
      /** Maxroll skill id. */
      skillId: string | number;
      /** Maxroll bnetFileName for the skill if present. */
      bnetFileName?: string;
    }
  | {
      category: "unique";
      /** Maxroll item name string. */
      name: string;
      /** Maxroll slot string. */
      itemSlot: string;
    };

// ─── Import report (always present in ok:true result) ─────────────────────────

export interface ImportReport {
  unmappedAffixes: UnmappedRef[];
  unmappedAspects: UnmappedRef[];
  unmappedParagonNodes: UnmappedRef[];
  unmappedGlyphs: UnmappedRef[];
  unmappedSkills: UnmappedRef[];
  /** Present when the planner's patch differs from the catalog's verifiedAgainst.patch,
   *  but the explicit-affix mapping rate was at or above 50% (D9). */
  versionMismatch?: {
    catalogPatch: string;
    plannerVersion: string;
    explicitMappedRatio: number;
  };
}

// ─── Per-variant result ────────────────────────────────────────────────────────

export interface VariantResult {
  variantIndex: number;
  variantName?: string;
  character: Omit<Character, "id">;
  /** Partial build — carries importedFrom provenance; id/characterId set by server. */
  build: Omit<Build, "id" | "characterId">;
  /** Snapshot of equippedItems for display (same as character.equippedItems). */
  items: Record<string, Item>;
  report: ImportReport;
}

// ─── Top-level ImportResult (D7) ──────────────────────────────────────────────

export type ImportResult =
  | {
      ok: true;
      plannerId: string;
      variants: VariantResult[];
    }
  | {
      ok: false;
      reason:
        | "not-found"
        | "private"
        | "patch-mismatch"
        | "zero-mapped"
        | "network"
        | "parse-error";
      message: string;
      details?: unknown;
    };

// ─── Import context (D2) ──────────────────────────────────────────────────────

export interface ImportContext {
  /** Override the global fetch (used in tests to inject fixture payloads). */
  fetch?: typeof globalThis.fetch;
  /** Directory for data.min.json patch-keyed cache files. Defaults to DATA_DIR/maxroll-cache. */
  cacheDir?: string;
  /** Current timestamp. Defaults to new Date(). */
  now?: Date;
}
