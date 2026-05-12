import { z } from "zod";
import { ItemSchema } from "./item";

/**
 * Structured provenance for builds imported from Maxroll planner (D19).
 * Optional — absent when the build was created manually (the default case).
 * Every existing consumer of Build continues to work when this field is absent.
 */
export const BuildImportedFromSchema = z.object({
  source: z.literal("maxroll"),
  /** Maxroll planner id (the path segment, e.g. "ab12cd34"). */
  plannerId: z.string().min(1),
  /** Index of the selected variant within the planner's variants array. */
  variantIndex: z.number().int().min(0),
  /** ISO-8601 timestamp of the import. */
  importedAt: z.string().datetime(),
  /** Maxroll planner version string observed at import time (e.g. "2.0.0"). */
  plannerVersion: z.string(),
});

export type BuildImportedFrom = z.infer<typeof BuildImportedFromSchema>;

/**
 * Canonical Build entity (v2+).
 *
 * A Build belongs to a Character via characterId (FK).
 * targetItems: the hypothetical/goal item per slot (empty by default).
 * In v2, UI only surfaces current character items; target slots are reserved
 * for the comparison surface in a future commission.
 * No schemaVersion field (D4 patron override).
 * importedFrom: optional provenance field for Maxroll-imported builds (D19).
 */
export const BuildSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  characterId: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1, "Build name is required"),
  notes: z.string().default(""),
  targetItems: z.record(z.string(), ItemSchema).default({}),
  /** Optional structured provenance for builds imported from an external planner (D19). */
  importedFrom: BuildImportedFromSchema.optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type Build = z.infer<typeof BuildSchema>;
