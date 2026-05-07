import * as fs from "fs/promises";
import slugify from "slugify";
import { BuildSchema, type Build } from "@/lib/schema";
import { buildPath, buildsDir, isSafeId } from "./paths";
import { atomicWriteJson } from "./index";

/** Generate a URL-safe slug for a build name, with collision suffix. */
async function generateBuildId(name: string): Promise<string> {
  const base = slugify(name, { lower: true, strict: true, trim: true }) || "build";
  const existing = await listBuildIds();
  const existingSet = new Set(existing);
  if (!existingSet.has(base)) return base;
  let n = 2;
  while (existingSet.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** List all build ids (slugs) on disk. */
async function listBuildIds(): Promise<string[]> {
  const dir = buildsDir();
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((e) => e.endsWith(".json"))
      .map((e) => e.slice(0, -5))
      .filter(isSafeId);
  } catch {
    return [];
  }
}

/** List all builds for a given characterId (or all if omitted). */
export async function listBuilds(characterId?: string): Promise<Build[]> {
  const ids = await listBuildIds();
  const results: Build[] = [];
  for (const id of ids) {
    const build = await loadBuild(id);
    if (build && (!characterId || build.characterId === characterId)) {
      results.push(build);
    }
  }
  return results;
}

/**
 * Load a build by id. Fails loud with the file path on Zod parse error (D23).
 */
export async function loadBuild(id: string): Promise<Build | null> {
  const filePath = buildPath(id);
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
    throw new Error(`Failed to parse JSON in build file: ${filePath}`);
  }

  const result = BuildSchema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `Build schema validation failed for file ${filePath}:\n${result.error.toString()}`
    );
  }
  return result.data;
}

/**
 * Save a build. If id is not set, generates a slug from the name.
 * Performs an atomic write (temp → rename).
 */
export async function saveBuild(
  build: Omit<Build, "id"> & { id?: string }
): Promise<Build> {
  const id = build.id ?? (await generateBuildId(build.name));
  const now = new Date().toISOString();
  const full: Build = BuildSchema.parse({
    ...build,
    id,
    updatedAt: now,
    createdAt: build.createdAt ?? now,
  });
  await atomicWriteJson(buildPath(id), full);
  return full;
}

/**
 * Delete a build file. Returns true if deleted, false if not found.
 */
export async function deleteBuild(id: string): Promise<boolean> {
  try {
    await fs.unlink(buildPath(id));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}
