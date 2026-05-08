import * as path from "path";

/** ID safety regex — enforced at every route entry point (D24). */
export const SAFE_ID_RE = /^[a-z0-9-]+$/;

export function isSafeId(id: string): boolean {
  return SAFE_ID_RE.test(id);
}

export function getDataDir(): string {
  const dataDir = process.env.DATA_DIR;
  if (!dataDir) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DATA_DIR environment variable is required in production.");
    }
    return path.resolve("./data");
  }
  return dataDir;
}

export function characterPath(id: string): string {
  return path.join(getDataDir(), "characters", `${id}.json`);
}

export function buildPath(id: string): string {
  return path.join(getDataDir(), "builds", `${id}.json`);
}

export function charactersDir(): string {
  return path.join(getDataDir(), "characters");
}

export function buildsDir(): string {
  return path.join(getDataDir(), "builds");
}

/**
 * Returns the SCREENSHOT_DIR path.
 * Strict-always — throws clearly when unset, no dev fallback (D2).
 */
export function getScreenshotDir(): string {
  const dir = process.env.SCREENSHOT_DIR;
  if (!dir) {
    throw new Error(
      "SCREENSHOT_DIR environment variable is required. Set it to the directory containing your D4 loot screenshots."
    );
  }
  return dir;
}

/** Path to the active-build pointer file. */
export function activeBuildPath(): string {
  return path.join(getDataDir(), "active-build.json");
}

/** Directory where per-image parse cache entries are stored. */
export function screenshotCacheDir(): string {
  return path.join(getDataDir(), "screenshot-cache");
}

/** Path to a specific cache entry by SHA-256 hash. */
export function screenshotCachePath(hash: string): string {
  return path.join(screenshotCacheDir(), `${hash}.json`);
}
