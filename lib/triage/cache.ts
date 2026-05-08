import * as fs from "fs/promises";
import { CacheEntrySchema, type CacheEntry } from "./types";
import { screenshotCachePath } from "@/lib/persistence/paths";
import { atomicWriteJson } from "@/lib/persistence";

/**
 * Reads a cache entry for the given SHA-256 hash.
 * Returns null on ENOENT (cache miss).
 * Throws on parse/validation failure.
 * Follows the loadBuild pattern (D13).
 */
export async function getCachedParse(hash: string): Promise<CacheEntry | null> {
  const filePath = screenshotCachePath(hash);
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
    throw new Error(`Failed to parse JSON in cache file: ${filePath}`);
  }

  const result = CacheEntrySchema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `Cache entry schema validation failed for file ${filePath}:\n${result.error.toString()}`
    );
  }
  return result.data;
}

/**
 * Writes a cache entry atomically.
 * Only successes and 'no-item-detected' are cached; errors are NOT (D13).
 */
export async function writeCachedParse(hash: string, entry: CacheEntry): Promise<void> {
  await atomicWriteJson(screenshotCachePath(hash), entry);
}
