import { z } from "zod";

/**
 * A single affix roll on an item.
 * isGreater is DERIVED (rolledValue vs catalog max) — not stored.
 */
export const AffixInstanceSchema = z.object({
  affixId: z.string().min(1),
  rolledValue: z.number(),
});

export type AffixInstance = z.infer<typeof AffixInstanceSchema>;
