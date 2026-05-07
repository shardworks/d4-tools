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
