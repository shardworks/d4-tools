import { z } from "zod";

/**
 * An aspect imprinted on or extracted from an item.
 * source distinguishes codex-of-power (fixed roll range) from
 * extracted legendaries (may have different roll caps).
 */
export const AspectInstanceSchema = z.object({
  aspectId: z.string().min(1),
  rolledValue: z.number(),
  source: z.enum(["legendary", "codex"]),
});

export type AspectInstance = z.infer<typeof AspectInstanceSchema>;
