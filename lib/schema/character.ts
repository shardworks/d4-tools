import { z } from "zod";
import { ItemSchema } from "./item";
import { SkillSelectionSchema } from "./skill";
import { ParagonAllocationSchema } from "./paragon";
import { PlaystyleConstraintSchema } from "./playstyle";

export const D4_CLASSES = [
  "Barbarian",
  "Druid",
  "Necromancer",
  "Rogue",
  "Sorcerer",
  "Spiritborn",
  "Paladin",
  "Warlock",
] as const;

export const D4ClassSchema = z.enum(D4_CLASSES);
export type D4Class = z.infer<typeof D4ClassSchema>;

/**
 * Provenance block appended to characters imported from Battle.net (D12, D30).
 * The block is optional — manually entered characters omit it and remain schema-valid.
 * Consumers must not assume this field is present.
 */
export const CharacterImportSchema = z.object({
  /** Always "battlenet" for the v3 import path. */
  source: z.literal("battlenet"),
  /** Numeric Blizzard hero ID from the profile roster. */
  heroId: z.union([z.number().int().positive(), z.string().min(1)]),
  /** Game realm slug: "seasonal" or "eternal". */
  realm: z.string().min(1),
  /** Blizzard API region the hero lives on. */
  region: z.enum(["americas", "europe", "asia"]),
  /**
   * Blizzard season number at import time (e.g. "13"), or null for eternal-realm characters.
   * D30: null = eternal; non-empty string = seasonal.
   */
  season: z.string().nullable(),
  /** ISO-8601 timestamp of when the import was performed. */
  importedAt: z.string().datetime(),
});

export type CharacterImport = z.infer<typeof CharacterImportSchema>;

/**
 * Canonical Character entity (v2+).
 *
 * equippedItems: keyed by slot id (catalog-driven slot ids only; no weapon3/4/5).
 * paragonAllocation: structured shape for future visual board rendering.
 * skillSelections: flat array across all classes (D10).
 * playstyleConstraints: full typed shape, empty default (D11).
 * import: optional Battle.net provenance block (D12/D30); omitted for manual entry.
 * No schemaVersion field (D4 patron override).
 */
export const CharacterSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1, "Name is required"),
  class: D4ClassSchema,
  level: z.number().int().min(1).max(100).default(1),
  paragonAllocation: ParagonAllocationSchema.default({ paragonLevel: 0, boards: [] }),
  skillSelections: z.array(SkillSelectionSchema).default([]),
  equippedItems: z.record(z.string(), ItemSchema).default({}),
  playstyleConstraints: z.array(PlaystyleConstraintSchema).default([]),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  /** Battle.net import provenance (D12/D30). Absent on manually entered characters. */
  import: CharacterImportSchema.optional(),
});

export type Character = z.infer<typeof CharacterSchema>;
