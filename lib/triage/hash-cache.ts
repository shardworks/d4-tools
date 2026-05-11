/**
 * In-memory hash cache for screenshot files.
 *
 * Caches the SHA-256 hash of each file keyed by (filename, mtimeMs, size) so that
 * repeated gallery scans skip the full-bytes read when the tuple is unchanged (D1–D2).
 *
 * API (D7):
 *  - getCachedHash(filename, mtimeMs, size, compute) — compute-through; thunk not called on hit
 *  - forget(filename)          — evict a single entry after a successful DELETE (D4)
 *  - pruneNotIn(set)           — drop stale entries after a scan (D5, D8)
 *
 * The cache is intentionally silent: no logging, no persistence (D11, D1).
 */

type HashCacheEntry = {
  mtimeMs: number;
  size: number;
  hash: string;
};

const cache = new Map<string, HashCacheEntry>();

/**
 * Returns the hash for the given file, using the cache when the
 * (filename, mtimeMs, size) tuple is unchanged.
 *
 * On a cache hit the compute thunk is NOT invoked.
 * On a miss the thunk is invoked, the result is stored, and the hash is returned.
 * If the thunk throws the cache is left unmodified and the error propagates (D10).
 *
 * The caller is responsible for obtaining mtimeMs and size via fs.stat, and for
 * supplying a thunk that reads the file bytes and hashes them. The cache never
 * performs its own I/O (D7).
 */
export async function getCachedHash(
  filename: string,
  mtimeMs: number,
  size: number,
  compute: () => Promise<string>,
): Promise<string> {
  const entry = cache.get(filename);
  if (entry !== undefined && entry.mtimeMs === mtimeMs && entry.size === size) {
    return entry.hash;
  }
  // Miss — invoke the thunk. If it throws, leave the cache unmodified (D10).
  const hash = await compute();
  cache.set(filename, { mtimeMs, size, hash });
  return hash;
}

/**
 * Removes the cache entry for filename, if present.
 * Called by the DELETE handler after a successful unlink (D4).
 * No-op when the filename is not in the cache.
 */
export function forget(filename: string): void {
  cache.delete(filename);
}

/**
 * Removes all entries whose filenames are absent from liveFilenames.
 * Called by the scan helper after each directory scan so that files deleted
 * out-of-band (operator rename, move, etc.) self-heal on the next scan (D5).
 */
export function pruneNotIn(liveFilenames: Set<string>): void {
  for (const key of cache.keys()) {
    if (!liveFilenames.has(key)) {
      cache.delete(key);
    }
  }
}
