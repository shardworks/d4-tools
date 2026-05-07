import { z } from "zod";

/**
 * The five constraint categories from scoring-engine.md §7.
 */
export const PLAYSTYLE_CATEGORIES = [
  "skill",
  "damage-type",
  "mechanic",
  "content",
  "item",
] as const;

export const PlaystyleConstraintSchema = z.object({
  /** Which constraint category this belongs to (scoring-engine §7) */
  category: z.enum(PLAYSTYLE_CATEGORIES),
  /** must = required; avoid = excluded */
  kind: z.enum(["must", "avoid"]),
  /**
   * Free-form payload appropriate to the category.
   * Examples:
   *   skill:       { skillId: "sorc_fireball" }
   *   damage-type: { damageType: "Fire" }
   *   mechanic:    { mechanic: "vulnerable-spam" }
   *   content:     { target: "pit-push" }
   *   item:        { aspectId: "aspect_of_frozen_orbit" }
   */
  payload: z.record(z.string(), z.unknown()),
  /**
   * Hard constraints cause the scoring engine to refuse recommendations;
   * soft constraints apply a score penalty only.
   */
  hard: z.boolean().default(false),
});

export type PlaystyleConstraint = z.infer<typeof PlaystyleConstraintSchema>;
