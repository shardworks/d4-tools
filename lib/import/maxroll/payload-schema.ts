/**
 * Zod validation schema for Maxroll planner API payloads (D28).
 *
 * Uses .passthrough() on every object so unknown extra fields are tolerated
 * (benign Maxroll additions don't break the importer). Parse-or-throw on
 * missing required fields (fail-loud on real shape drift).
 *
 * Endpoint: GET planners.maxroll.gg/profiles/load?profile=<id>
 * Data:     GET assets-ng.maxroll.gg/d4/data.min.json (patch-keyed cache, D4)
 *
 * Shapes inferred from community implementations (d4lfteam/d4lf, LeiZheng/d4-build)
 * and observable browser-devtools payloads.
 */

import { z } from "zod";

// ─── Affix entry in a Maxroll item ────────────────────────────────────────────

export const MaxrollAffixSchema = z
  .object({
    /** Maxroll numeric stat nid (as number in payload). */
    nid: z.number(),
    /** Rolled value. May be absent for some affixes. */
    values: z.array(z.number()).optional(),
    /** True when this affix is tempered (imprinted via tempering). */
    tempered: z.boolean().optional(),
  })
  .passthrough();

export type MaxrollAffix = z.infer<typeof MaxrollAffixSchema>;

// ─── Single item in the equipped loadout ──────────────────────────────────────

export const MaxrollItemSchema = z
  .object({
    /** Maxroll item id (maps to data.min.json item entries). */
    id: z.number().optional(),
    /** Display name of the item. */
    name: z.string().optional(),
    /** Item power / item level. */
    power: z.number().optional(),
    /** True when the item is ancestral. */
    ancestral: z.boolean().optional(),
    /** Affix array. */
    affixes: z.array(MaxrollAffixSchema).optional(),
    /** Aspect nid (numeric id). */
    aspect: z.number().optional(),
    /** Aspect rolled value. */
    aspectValues: z.array(z.number()).optional(),
    /** Rarity string (e.g. "Legendary", "Unique", "Rare"). */
    rarity: z.string().optional(),
  })
  .passthrough();

export type MaxrollItem = z.infer<typeof MaxrollItemSchema>;

// ─── Skill selection ──────────────────────────────────────────────────────────

export const MaxrollSkillSchema = z
  .object({
    /** Maxroll skill nid (numeric id). */
    id: z.number(),
    /** Points allocated to this skill. */
    points: z.number().optional(),
  })
  .passthrough();

export type MaxrollSkill = z.infer<typeof MaxrollSkillSchema>;

// ─── Paragon node ─────────────────────────────────────────────────────────────

export const MaxrollParagonNodeSchema = z
  .object({
    /** Maxroll node id. */
    id: z.number(),
  })
  .passthrough();

export type MaxrollParagonNode = z.infer<typeof MaxrollParagonNodeSchema>;

// ─── Paragon board ────────────────────────────────────────────────────────────

export const MaxrollParagonBoardSchema = z
  .object({
    /** Board id in data.min.json. */
    id: z.number().optional(),
    /** Board name. */
    name: z.string().optional(),
    /** Glyph socketed in this board (numeric id). */
    glyph: z.number().optional(),
    /** Glyph level. */
    glyphLevel: z.number().optional(),
    /** Activated node ids. */
    nodes: z.array(z.union([z.number(), z.string()])).optional(),
  })
  .passthrough();

export type MaxrollParagonBoard = z.infer<typeof MaxrollParagonBoardSchema>;

// ─── Single variant (build configuration) ─────────────────────────────────────

export const MaxrollVariantSchema = z
  .object({
    /** Variant name / label. */
    name: z.string().optional(),
    /** Character class string (e.g. "sorcerer", "barbarian"). */
    class: z.string().optional(),
    /** Character level. */
    level: z.number().optional(),
    /** Paragon level. */
    paragonLevel: z.number().optional(),
    /** Equipped items keyed by slot string. */
    equipped: z.record(z.string(), MaxrollItemSchema).optional(),
    /** Skill selections. */
    skills: z.array(MaxrollSkillSchema).optional(),
    /** Paragon boards. */
    paragon: z.array(MaxrollParagonBoardSchema).optional(),
  })
  .passthrough();

export type MaxrollVariant = z.infer<typeof MaxrollVariantSchema>;

// ─── Top-level planner profile payload ────────────────────────────────────────

export const MaxrollProfilePayloadSchema = z
  .object({
    /** Planner version. */
    version: z.string().optional(),
    /** Planner id. */
    id: z.string().optional(),
    /** Array of build variants. */
    d4t: z.array(MaxrollVariantSchema).optional(),
    /** Some payloads embed variants at the top level with a different key. */
    variants: z.array(MaxrollVariantSchema).optional(),
    /** Some payloads have a single default variant inline. */
    class: z.string().optional(),
    equipped: z.record(z.string(), MaxrollItemSchema).optional(),
    skills: z.array(MaxrollSkillSchema).optional(),
    paragon: z.array(MaxrollParagonBoardSchema).optional(),
    level: z.number().optional(),
    paragonLevel: z.number().optional(),
  })
  .passthrough();

export type MaxrollProfilePayload = z.infer<typeof MaxrollProfilePayloadSchema>;

// ─── data.min.json stat/item entry ────────────────────────────────────────────

export const MaxrollDataMinStatSchema = z
  .object({
    /** Numeric stat nid (key in the stats map). */
    id: z.number().optional(),
    /** Datamine file name — the importer's primary join key. */
    bnetFileName: z.string().optional(),
    /** Human-readable label. */
    name: z.string().optional(),
    /** True when this stat is an implicit. */
    isImplicit: z.boolean().optional(),
    /** True when this stat is tempered. */
    isTempered: z.boolean().optional(),
  })
  .passthrough();

export type MaxrollDataMinStat = z.infer<typeof MaxrollDataMinStatSchema>;

export const MaxrollDataMinAspectSchema = z
  .object({
    id: z.number().optional(),
    bnetFileName: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();

export type MaxrollDataMinAspect = z.infer<typeof MaxrollDataMinAspectSchema>;

export const MaxrollDataMinGlyphSchema = z
  .object({
    id: z.number().optional(),
    bnetFileName: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();

export type MaxrollDataMinGlyph = z.infer<typeof MaxrollDataMinGlyphSchema>;

export const MaxrollDataMinSkillSchema = z
  .object({
    id: z.number().optional(),
    bnetFileName: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();

export type MaxrollDataMinSkill = z.infer<typeof MaxrollDataMinSkillSchema>;

// ─── Top-level data.min.json payload ──────────────────────────────────────────

export const MaxrollDataMinSchema = z
  .object({
    /** Patch / version string for the data file. Used for cache-key and drift detection. */
    version: z.string().optional(),
    /** Stats map keyed by numeric nid (as string in JSON). */
    stats: z.record(z.string(), MaxrollDataMinStatSchema).optional(),
    /** Aspects map keyed by numeric id (as string in JSON). */
    aspects: z.record(z.string(), MaxrollDataMinAspectSchema).optional(),
    /** Glyphs map keyed by numeric id (as string in JSON). */
    glyphs: z.record(z.string(), MaxrollDataMinGlyphSchema).optional(),
    /** Skills map keyed by numeric id (as string in JSON). */
    skills: z.record(z.string(), MaxrollDataMinSkillSchema).optional(),
  })
  .passthrough();

export type MaxrollDataMin = z.infer<typeof MaxrollDataMinSchema>;
