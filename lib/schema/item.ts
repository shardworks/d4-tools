import { z } from "zod";
import { AffixInstanceSchema } from "./affix";
import { AspectInstanceSchema } from "./aspect";

export const ITEM_RARITIES = [
  "common",
  "magic",
  "rare",
  "legendary",
  "unique",
  "mythic",
] as const;

export const ItemRaritySchema = z.enum(ITEM_RARITIES);
export type ItemRarity = z.infer<typeof ItemRaritySchema>;

/**
 * A single equipped or target item for a gear slot.
 *
 * Distinct affix categories (D6):
 *   implicits  — fixed intrinsic affixes (e.g. unique bonuses)
 *   explicits  — rolled affixes (the main affix pool)
 *   tempered   — tempering imprints (up to 2, exclusive of explicit slots)
 *   aspect     — codex-of-power or extracted legendary aspect
 *
 * masterworkRank, runes, sockets reserved for future v3+ UI.
 * isAncestral explicit flag per D9.
 * No isGreater field — derived from rolledValue vs catalog max (D8).
 */
export const ItemSchema = z.object({
  slot: z.string().min(1),
  name: z.string().default(""),
  rarity: ItemRaritySchema,
  itemPower: z.number().int().min(0).optional(),
  isAncestral: z.boolean().default(false),
  implicits: z.array(AffixInstanceSchema).default([]),
  explicits: z.array(AffixInstanceSchema).default([]),
  tempered: z.array(AffixInstanceSchema).default([]),
  aspect: AspectInstanceSchema.optional(),
  // Reserved for future commissions — default-empty so the shape is complete
  masterworkRank: z.number().int().min(0).max(12).default(0),
  runes: z.array(z.string()).default([]),
  sockets: z.array(z.string()).default([]),
});

export type Item = z.infer<typeof ItemSchema>;
