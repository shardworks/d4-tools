import { z } from "zod";

// ─── LLM extraction types (display-name-shaped, pre-resolution) ────────────

/**
 * A single affix as extracted from a screenshot by the Vision LLM.
 * Uses display labels (e.g. "Maximum Life"), not catalog IDs.
 */
export const LlmExtractedAffixSchema = z.object({
  label: z.string(),
  rolledValue: z.number(),
});
export type LlmExtractedAffix = z.infer<typeof LlmExtractedAffixSchema>;

/**
 * A single aspect as extracted from a screenshot by the Vision LLM.
 */
export const LlmExtractedAspectSchema = z.object({
  label: z.string(),
  rolledValue: z.number(),
});
export type LlmExtractedAspect = z.infer<typeof LlmExtractedAspectSchema>;

/**
 * A complete item as extracted from a screenshot by the Vision LLM.
 * itemType uses in-game display strings (e.g. "Helm", "Ring", "Two-Handed Sword").
 */
export const LlmExtractedItemSchema = z.object({
  name: z.string().default(""),
  itemType: z.string(),
  rarity: z.string(),
  itemPower: z.number().int().min(0).optional(),
  isAncestral: z.boolean().default(false),
  implicits: z.array(LlmExtractedAffixSchema).default([]),
  explicits: z.array(LlmExtractedAffixSchema).default([]),
  tempered: z.array(LlmExtractedAffixSchema).default([]),
  aspect: LlmExtractedAspectSchema.optional(),
});
export type LlmExtractedItem = z.infer<typeof LlmExtractedItemSchema>;

// ─── Cache entry shape (D14) ────────────────────────────────────────────────

/**
 * A successful parse — one or more items extracted from the screenshot.
 */
export const CacheEntryItemSchema = z.object({
  kind: z.literal("item"),
  items: z.array(LlmExtractedItemSchema),
  model: z.string(),
  timestamp: z.string().datetime(),
});

/**
 * The LLM determined no item is visible in the screenshot.
 */
export const CacheEntryNoItemSchema = z.object({
  kind: z.literal("no-item-detected"),
  model: z.string(),
  timestamp: z.string().datetime(),
});

/**
 * The LLM could not reliably parse the screenshot (blurry, partial, etc.).
 * The raw response is stored for debugging.
 */
export const CacheEntryUncertainSchema = z.object({
  kind: z.literal("uncertain"),
  raw: z.unknown().optional(),
  model: z.string(),
  timestamp: z.string().datetime(),
});

export const CacheEntrySchema = z.discriminatedUnion("kind", [
  CacheEntryItemSchema,
  CacheEntryNoItemSchema,
  CacheEntryUncertainSchema,
]);
export type CacheEntry = z.infer<typeof CacheEntrySchema>;

// ─── Resolver result types ──────────────────────────────────────────────────

/**
 * Result of resolving a single affix display-name → catalog ID.
 *
 * - 'resolved'       = confident catalog match within range.
 * - 'uncertain'      = could not confidently resolve; reason details the failure mode:
 *   - 'out-of-range'   : name matched a catalog entry but the rolled value is outside
 *                        [min, max]; affixId carries the matched entry id.
 *   - 'no-match'       : no catalog entry matched the label.
 *   - 'ambiguous'      : multiple catalog entries scored above the fuzzy threshold;
 *                        candidates[] carries the top affix ids for user disambiguation.
 *   - 'value-mismatch' : the value was auto-corrected for unit format (e.g. 0.08 → 8
 *                        when isPercent and value ∈ [0,1]); unitCorrected carries the
 *                        corrected value; affixId carries the matched entry.
 *
 * D7: flat reason union — no nested discriminated union.
 */
export type AffixMatchResult =
  | { kind: "resolved"; affixId: string; rolledValue: number }
  | {
      kind: "uncertain";
      label: string;
      rolledValue: number;
      reason: "out-of-range" | "no-match";
      affixId?: string; // present when reason is out-of-range (name matched, value didn't)
    }
  | {
      kind: "uncertain";
      label: string;
      rolledValue: number;
      reason: "ambiguous";
      /** Top candidate affix ids for user disambiguation (D5). */
      candidates: string[];
    }
  | {
      kind: "uncertain";
      label: string;
      rolledValue: number;
      reason: "value-mismatch";
      /** The matched catalog affix id. */
      affixId: string;
      /** The auto-corrected value (e.g. 0.08 → 8). */
      unitCorrected: number;
    };

/**
 * Result of resolving an aspect display-name → catalog ID.
 *
 * Same reason taxonomy as AffixMatchResult (D7).
 */
export type AspectMatchResult =
  | { kind: "resolved"; aspectId: string; rolledValue: number }
  | {
      kind: "uncertain";
      label: string;
      rolledValue: number;
      reason: "out-of-range" | "no-match";
      aspectId?: string; // present when reason is out-of-range
    }
  | {
      kind: "uncertain";
      label: string;
      rolledValue: number;
      reason: "ambiguous";
      /** Top candidate aspect ids for user disambiguation (D5). */
      candidates: string[];
    }
  | {
      kind: "uncertain";
      label: string;
      rolledValue: number;
      reason: "value-mismatch";
      /** The matched catalog aspect id. */
      aspectId: string;
      /** The auto-corrected value. */
      unitCorrected: number;
    };

/**
 * Result of resolving an item type → slot ID(s) for the active class.
 * 'resolved'     = exactly one eligible slot.
 * 'ambiguous'    = multiple candidates (rings, Barbarian dual-1H).
 * 'incompatible' = no eligible slot for the character's class (D20).
 */
export type SlotMatchResult =
  | { kind: "resolved"; slotId: string }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "incompatible" };

/**
 * A fully-processed item with per-affix and per-aspect resolution results.
 * Ready for display in ComparisonPanel and DetailPane.
 */
export interface ResolvedItem {
  name: string;
  rarity: string;
  itemPower?: number;
  isAncestral: boolean;
  implicits: AffixMatchResult[];
  explicits: AffixMatchResult[];
  tempered: AffixMatchResult[];
  aspect?: AspectMatchResult;
  slotResult: SlotMatchResult;
}

/**
 * Gallery entry returned by GET /api/triage/screenshots.
 */
export interface ScreenshotEntry {
  filename: string;
  mtimeMs: number;
  hash: string;
}

/**
 * Supported image media types (Anthropic Vision API accepts these).
 */
export const SUPPORTED_IMAGE_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
} as const;

export type SupportedImageMediaType = (typeof SUPPORTED_IMAGE_TYPES)[keyof typeof SUPPORTED_IMAGE_TYPES];
