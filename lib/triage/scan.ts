/**
 * Shared gallery scan helper.
 *
 * Both the /triage Server Component and the GET /api/triage/screenshots route
 * call scanScreenshotDir(dir) instead of inlining their own scan loops. This
 * consolidates the readdir → filter → stat → hash → sort pipeline in one place
 * and routes every hash lookup through the in-memory hash cache.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { sha256 } from "./hash";
import { getCachedHash, pruneNotIn } from "./hash-cache";
import { SUPPORTED_IMAGE_TYPES } from "./types";
import type { ScreenshotEntry } from "./types";

const SUPPORTED_EXTS = new Set(Object.keys(SUPPORTED_IMAGE_TYPES));

/**
 * Scans dir for supported image files and returns a ScreenshotEntry[] sorted
 * by mtimeMs descending (newest first).
 *
 * - Per-file stat failures are silently skipped (preserving the existing
 *   externally-observable silent-skip contract).
 * - Hash computation is backed by the in-memory hash cache: the file bytes are
 *   only read when (filename, mtimeMs, size) is not already cached.
 * - After each scan, pruneNotIn() is called with the live filename set so that
 *   files deleted out-of-band self-heal on the next scan (D5).
 *
 * The caller is responsible for resolving dir (e.g. from getScreenshotDir());
 * this function does not call getScreenshotDir() itself so it can be reused in
 * any context without the env-var dependency.
 *
 * Throws if the directory cannot be read (e.g. ENOENT), letting the caller
 * surface an appropriate error response.
 */
export async function scanScreenshotDir(dir: string): Promise<ScreenshotEntry[]> {
  // Throws on ENOENT / permission failure — callers catch and return 500.
  const dirEntries = await fs.readdir(dir, { withFileTypes: true });

  const imageFiles = dirEntries.filter((e) => {
    if (!e.isFile()) return false;
    const ext = path.extname(e.name).toLowerCase();
    return SUPPORTED_EXTS.has(ext);
  });

  const liveFilenames = new Set(imageFiles.map((e) => e.name));
  const results: ScreenshotEntry[] = [];

  // Sequential loop — do NOT parallelize (spec: do not change existing behavior).
  for (const file of imageFiles) {
    const filePath = path.join(dir, file.name);
    try {
      const stat = await fs.stat(filePath);
      const hash = await getCachedHash(
        file.name,
        stat.mtimeMs,
        stat.size,
        () => fs.readFile(filePath).then(sha256),
      );
      results.push({
        filename: file.name,
        mtimeMs: stat.mtimeMs,
        hash,
      });
    } catch {
      // Skip unreadable / stat-failed files
    }
  }

  // Self-heal: remove cache entries for files that are no longer on disk (D5).
  pruneNotIn(liveFilenames);

  results.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return results;
}
