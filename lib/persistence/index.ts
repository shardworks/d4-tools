/**
 * Core persistence primitives (v1 surface preserved).
 * Per-entity helpers live in characters.ts / builds.ts.
 */
import * as fs from "fs/promises";
import * as path from "path";
import { getDataDir } from "./paths";

export { getDataDir } from "./paths";

export async function readJsonFile<T>(filename: string): Promise<T | null> {
  const dataDir = getDataDir();
  const filePath = path.join(dataDir, filename);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeJsonFile<T>(filename: string, data: T): Promise<void> {
  const dataDir = getDataDir();
  await fs.mkdir(dataDir, { recursive: true });
  const filePath = path.join(dataDir, filename);
  await atomicWriteJson(filePath, data);
}

/**
 * Atomic JSON write: write to a temp file then rename.
 * On POSIX, rename(2) is atomic when src and dest are on the same filesystem.
 */
export async function atomicWriteJson<T>(filePath: string, data: T): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}`;
  try {
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmp, filePath);
  } catch (err) {
    // Best-effort cleanup
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
}

// Re-export per-entity helpers for convenience
export * from "./characters";
export * from "./builds";
export * from "./active-build";
