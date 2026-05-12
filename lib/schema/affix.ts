import { z } from "zod";

/**
 * A single affix roll on an item.
 * isGreater is DERIVED (rolledValue vs catalog max) — not stored.
 * rolledRange is the alternative value-shape for two-number affixes
 * (e.g. weapon damage implicits). Exactly one of rolledValue or rolledRange
 * must be set — neither-set and both-set are invalid.
 */
export const AffixInstanceSchema = z
  .object({
    affixId: z.string().min(1),
    rolledValue: z.number().optional(),
    rolledRange: z.tuple([z.number(), z.number()]).optional(),
  })
  .refine(
    (d) => (d.rolledValue !== undefined) !== (d.rolledRange !== undefined),
    { message: "Exactly one of rolledValue or rolledRange must be set" }
  );

export type AffixInstance = z.infer<typeof AffixInstanceSchema>;
