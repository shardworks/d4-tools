import * as fs from "fs/promises";
import slugify from "slugify";
import { CharacterSchema, type Character } from "@/lib/schema";
import { characterPath, charactersDir, isSafeId } from "./paths";
import { atomicWriteJson } from "./index";

/** Generate a URL-safe slug from a name, with collision suffix. */
async function generateCharacterId(name: string): Promise<string> {
  const base = slugify(name, { lower: true, strict: true, trim: true }) || "character";
  const existing = await listCharacterIds();
  const existingSet = new Set(existing);
  if (!existingSet.has(base)) return base;
  let n = 2;
  while (existingSet.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** List all character ids (slugs) on disk. */
async function listCharacterIds(): Promise<string[]> {
  const dir = charactersDir();
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

/** List all characters (loads and validates each). */
export async function listCharacters(): Promise<Character[]> {
  const ids = await listCharacterIds();
  const results: Character[] = [];
  for (const id of ids) {
    const char = await loadCharacter(id);
    if (char) results.push(char);
  }
  return results;
}

/**
 * Load a character by id. Fails loud with the file path on Zod parse error (D23).
 */
export async function loadCharacter(id: string): Promise<Character | null> {
  const filePath = characterPath(id);
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
    throw new Error(`Failed to parse JSON in character file: ${filePath}`);
  }

  const result = CharacterSchema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `Character schema validation failed for file ${filePath}:\n${result.error.toString()}`
    );
  }
  return result.data;
}

/**
 * Save a character. If id is not set, generates a slug from the name.
 * Performs an atomic write (temp → rename).
 */
export async function saveCharacter(
  character: Omit<Character, "id"> & { id?: string }
): Promise<Character> {
  const id = character.id ?? (await generateCharacterId(character.name));
  const now = new Date().toISOString();
  const full: Character = CharacterSchema.parse({
    ...character,
    id,
    updatedAt: now,
    createdAt: character.createdAt ?? now,
  });
  await atomicWriteJson(characterPath(id), full);
  return full;
}

/**
 * Delete a character file. Returns true if the file was deleted, false if not found.
 */
export async function deleteCharacter(id: string): Promise<boolean> {
  try {
    await fs.unlink(characterPath(id));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}
