import * as fs from "fs/promises";
import * as path from "path";

function getDataDir(): string {
  const dataDir = process.env.DATA_DIR;
  if (!dataDir) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DATA_DIR environment variable is required in production.");
    }
    return "./data/";
  }
  return dataDir;
}

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
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
