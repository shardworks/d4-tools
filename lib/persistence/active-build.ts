import * as fs from "fs/promises";
import { z } from "zod";
import { activeBuildPath } from "./paths";
import { atomicWriteJson } from "./index";

/**
 * Zod schema for the active-build pointer file.
 * Stores only buildId; characterId is reachable via build.characterId (D6).
 */
export const ActiveBuildPointerSchema = z.object({
  buildId: z.string().min(1),
  updatedAt: z.string().datetime(),
});

export type ActiveBuildPointer = z.infer<typeof ActiveBuildPointerSchema>;

/**
 * Reads the active-build pointer and returns the buildId, or null if not set.
 * Follows the loadBuild pattern: ENOENT → null, parse failure → throw with path.
 */
export async function getActiveBuildId(): Promise<string | null> {
  const filePath = activeBuildPath();
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse JSON in active-build file: ${filePath}`);
  }

  const result = ActiveBuildPointerSchema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `active-build schema validation failed for file ${filePath}:\n${result.error.toString()}`
    );
  }
  return result.data.buildId;
}

/**
 * Writes the active-build pointer atomically.
 * Called server-side on each /builds/[id] page visit (D5).
 */
export async function setActiveBuildId(buildId: string): Promise<void> {
  const pointer: ActiveBuildPointer = {
    buildId,
    updatedAt: new Date().toISOString(),
  };
  await atomicWriteJson(activeBuildPath(), pointer);
}
