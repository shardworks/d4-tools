import { z } from "zod";

/**
 * A glyph socketed in a paragon board.
 */
export const ParagonGlyphSchema = z.object({
  glyphId: z.string().min(1),
  level: z.number().int().min(1).max(21).default(1),
});

export type ParagonGlyph = z.infer<typeof ParagonGlyphSchema>;

/**
 * Points and optional glyph allocation for a single paragon board.
 * nodes carries nodeIds for future visual board rendering (D12).
 */
export const ParagonBoardAllocationSchema = z.object({
  boardId: z.string().min(1),
  boardName: z.string().default(""),
  spentPoints: z.number().int().min(0).default(0),
  glyph: ParagonGlyphSchema.optional(),
  nodes: z.array(z.string()).default([]),
});

export type ParagonBoardAllocation = z.infer<typeof ParagonBoardAllocationSchema>;

/**
 * Full paragon allocation for a character.
 * paragonLevel drives the points-available validation
 * (game-math.json supplies the per-level allowance).
 */
export const ParagonAllocationSchema = z.object({
  paragonLevel: z.number().int().min(0).max(300).default(0),
  boards: z.array(ParagonBoardAllocationSchema).default([]),
});

export type ParagonAllocation = z.infer<typeof ParagonAllocationSchema>;
