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
 * Canonical Character entity (v2+).
 *
 * equippedItems: keyed by slot id (catalog-driven slot ids only; no weapon3/4/5).
 * paragonAllocation: structured shape for future visual board rendering.
 * skillSelections: flat array across all classes (D10).
 * playstyleConstraints: full typed shape, empty default (D11).
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
});

export type Character = z.infer<typeof CharacterSchema>;
