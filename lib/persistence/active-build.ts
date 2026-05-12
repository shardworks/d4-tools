import * as fs from "fs/promises";
import { z } from "zod";
import { activeBuildPath, buildPath } from "./paths";
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
 *
 * Self-healing: if the referenced build file no longer exists on disk the pointer is
 * treated as stale — it is unlinked and null is returned (D1, D2, D3, D5, D5b).
 * Only ENOENT from fs.access counts as "stale"; any other access error propagates (D5).
 * ENOENT from the subsequent unlink is tolerated (documented race with a concurrent
 * writer/clearer, D5b); any other unlink error propagates.
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

  const { buildId } = result.data;

  // Validate that the referenced build file still exists (existence check only — D8).
  // loadBuild is intentionally not called here; that would conflate "stale pointer"
  // with "corrupt build file" and silently hide the latter.
  try {
    await fs.access(buildPath(buildId));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    // Referent is gone — clear the pointer file and return null (D2).
    try {
      await fs.unlink(filePath);
    } catch (unlinkErr) {
      // Tolerate ENOENT: a concurrent writer/clearer already removed the pointer (D5b).
      if ((unlinkErr as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkErr;
    }
    return null;
  }

  return buildId;
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
