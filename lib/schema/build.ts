import { z } from "zod";
import { ItemSchema } from "./item";

/**
 * Canonical Build entity (v2+).
 *
 * A Build belongs to a Character via characterId (FK).
 * targetItems: the hypothetical/goal item per slot (empty by default).
 * In v2, UI only surfaces current character items; target slots are reserved
 * for the comparison surface in a future commission.
 * No schemaVersion field (D4 patron override).
 */
export const BuildSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  characterId: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1, "Build name is required"),
  notes: z.string().default(""),
  targetItems: z.record(z.string(), ItemSchema).default({}),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type Build = z.infer<typeof BuildSchema>;
