/**
 * Fetcher + disk cache for Maxroll's data.min.json (D4/D5).
 *
 * Cache key: DATA_DIR/maxroll-cache/data.min.<patch>.json
 * Invalidation: filename keyed by catalog patch string — if the patch changes,
 *   the new file is fetched and a new cache file is written.
 * No sliding TTL (D5) — patch-only invalidation.
 *
 * In-memory layer: after the first hit per process, the parsed result is
 * memoised so repeated calls within a Vitest run / server request don't
 * re-fetch or re-read disk.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { getDataDir } from "@/lib/persistence/paths";
import { getMaxrollDataBase, fetchMaxrollJson } from "./endpoints";
import { MaxrollDataMinSchema, type MaxrollDataMin } from "./payload-schema";

/** In-memory cache keyed by patch string. */
const memCache = new Map<string, MaxrollDataMin>();

/**
 * Return the directory used for data.min cache files.
 * Respects the `cacheDir` override from ImportContext (for tests).
 */
function getCacheDir(cacheDir?: string): string {
  if (cacheDir) return cacheDir;
  return path.join(getDataDir(), "maxroll-cache");
}

/** Path for a patch-keyed data.min cache file. */
function dataminCachePath(patchSlug: string, cacheDir: string): string {
  // Sanitise patch string for use as a filename segment.
  const safe = patchSlug.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(cacheDir, `data.min.${safe}.json`);
}

/**
 * Fetch (or load from cache) data.min.json for the given catalog patch.
 *
 * Strategy:
 * 1. Return from in-memory cache if present.
 * 2. Try to read from disk cache at DATA_DIR/maxroll-cache/data.min.<patch>.json.
 * 3. Fetch from Maxroll assets CDN, validate with Zod, write to disk, memoize.
 */
export async function getDataMin(
  catalogPatch: string,
  options?: { cacheDir?: string; fetch?: typeof globalThis.fetch }
): Promise<MaxrollDataMin> {
  const fetchFn = options?.fetch ?? globalThis.fetch;
  const cacheDir = getCacheDir(options?.cacheDir);

  // ── 1. In-memory ──────────────────────────────────────────────────────────
  const cached = memCache.get(catalogPatch);
  if (cached) return cached;

  // ── 2. Disk cache ─────────────────────────────────────────────────────────
  const diskPath = dataminCachePath(catalogPatch, cacheDir);
  try {
    const raw = await fs.readFile(diskPath, "utf-8");
    const parsed = MaxrollDataMinSchema.parse(JSON.parse(raw));
    memCache.set(catalogPatch, parsed);
    return parsed;
  } catch {
    // Cache miss — proceed to fetch
  }

  // ── 3. Network fetch ──────────────────────────────────────────────────────
  const url = `${getMaxrollDataBase()}/d4/data.min.json`;
  const raw = await fetchMaxrollJson<unknown>(url, fetchFn);
  const parsed = MaxrollDataMinSchema.parse(raw);

  // Write to disk (best-effort — don't break the import if the write fails)
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(diskPath, JSON.stringify(parsed, null, 2), "utf-8");
  } catch {
    // Ignore write failures; in-memory cache still helps within this process
  }

  memCache.set(catalogPatch, parsed);
  return parsed;
}

/** Clear the in-memory cache (used in tests to ensure isolation). */
export function clearDataMinCache(): void {
  memCache.clear();
}
