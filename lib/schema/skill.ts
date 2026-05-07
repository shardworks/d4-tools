import { z } from "zod";

/**
 * A single skill selection in the character's skill tree.
 * Flat array across all classes (D10) — slot field carries the UI slot
 * (e.g. "basic", "core", "ultimate", "key-passive") for classes that
 * assign active skills to bar slots.
 */
export const SkillSelectionSchema = z.object({
  skillId: z.string().min(1),
  rank: z.number().int().min(0).max(9),
  slot: z.string().optional(),
});

export const SkillSelectionsSchema = z.array(SkillSelectionSchema);

export type SkillSelection = z.infer<typeof SkillSelectionSchema>;
