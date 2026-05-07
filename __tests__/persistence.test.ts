import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { isSafeId } from "../lib/persistence/paths";

// Note: Full persistence tests require a temp DATA_DIR.
// We test the safe-id guard and path utilities here.
// Integration tests for the full CRUD flow are covered manually per acceptance signal.

describe("isSafeId", () => {
  it("accepts lowercase alphanumeric ids", () => {
    expect(isSafeId("doomed-aura-sorcerer")).toBe(true);
    expect(isSafeId("blizzard-ice-shards")).toBe(true);
    expect(isSafeId("my-build-2")).toBe(true);
    expect(isSafeId("abc123")).toBe(true);
  });

  it("rejects path traversal attempts", () => {
    expect(isSafeId("../etc/passwd")).toBe(false);
    expect(isSafeId("..%2Fetc%2Fpasswd")).toBe(false);
    expect(isSafeId("../../evil")).toBe(false);
  });

  it("rejects uppercase characters", () => {
    expect(isSafeId("MyBuild")).toBe(false);
    expect(isSafeId("Sorcerer")).toBe(false);
  });

  it("rejects special characters", () => {
    expect(isSafeId("build/subpath")).toBe(false);
    expect(isSafeId("build.json")).toBe(false);
    expect(isSafeId("build?query=1")).toBe(false);
    expect(isSafeId("build#anchor")).toBe(false);
    expect(isSafeId("build name")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isSafeId("")).toBe(false);
  });
});

describe("persistence integration (DATA_DIR-dependent)", () => {
  let tmpDir: string;
  const origDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "d4-test-"));
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    process.env.DATA_DIR = origDataDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("saveCharacter + loadCharacter round-trips data", async () => {
    // Dynamic import to pick up the env var change
    const { saveCharacter, loadCharacter } = await import("../lib/persistence/characters");

    const char = await saveCharacter({
      name: "Test Sorcerer",
      class: "Sorcerer",
      level: 50,
      paragonAllocation: { paragonLevel: 0, boards: [] },
      skillSelections: [],
      equippedItems: {},
      playstyleConstraints: [],
    });

    expect(char.id).toMatch(/^[a-z0-9-]+$/);
    expect(char.name).toBe("Test Sorcerer");
    expect(char.class).toBe("Sorcerer");

    const loaded = await loadCharacter(char.id);
    expect(loaded).toBeTruthy();
    expect(loaded!.name).toBe("Test Sorcerer");
    expect(loaded!.level).toBe(50);
  });

  it("loadCharacter returns null for missing file", async () => {
    const { loadCharacter } = await import("../lib/persistence/characters");
    const result = await loadCharacter("nonexistent-character");
    expect(result).toBeNull();
  });

  it("loadCharacter throws with file path when JSON is invalid", async () => {
    const charDir = path.join(tmpDir, "characters");
    await fs.mkdir(charDir, { recursive: true });
    await fs.writeFile(path.join(charDir, "bad-char.json"), '{ "name": 123 }', "utf-8");

    const { loadCharacter } = await import("../lib/persistence/characters");
    await expect(loadCharacter("bad-char")).rejects.toThrow("bad-char.json");
  });

  it("saveBuild + loadBuild round-trips data", async () => {
    const { saveBuild, loadBuild } = await import("../lib/persistence/builds");

    const build = await saveBuild({
      characterId: "test-char",
      name: "Blizzard Build",
      notes: "test",
      targetItems: {},
    });

    expect(build.id).toMatch(/^[a-z0-9-]+$/);
    expect(build.name).toBe("Blizzard Build");

    const loaded = await loadBuild(build.id);
    expect(loaded).toBeTruthy();
    expect(loaded!.characterId).toBe("test-char");
  });

  it("deleteCharacter removes the file", async () => {
    const { saveCharacter, deleteCharacter, loadCharacter } =
      await import("../lib/persistence/characters");

    const char = await saveCharacter({
      name: "Temp Character",
      class: "Rogue",
      level: 10,
      paragonAllocation: { paragonLevel: 0, boards: [] },
      skillSelections: [],
      equippedItems: {},
      playstyleConstraints: [],
    });

    const deleted = await deleteCharacter(char.id);
    expect(deleted).toBe(true);

    const after = await loadCharacter(char.id);
    expect(after).toBeNull();
  });

  it("deleteCharacter returns false for nonexistent id", async () => {
    const { deleteCharacter } = await import("../lib/persistence/characters");
    const result = await deleteCharacter("not-here");
    expect(result).toBe(false);
  });

  it("slug collision gets -2 suffix", async () => {
    const { saveCharacter } = await import("../lib/persistence/characters");

    const char1 = await saveCharacter({
      name: "My Character",
      class: "Druid",
      level: 1,
      paragonAllocation: { paragonLevel: 0, boards: [] },
      skillSelections: [],
      equippedItems: {},
      playstyleConstraints: [],
    });

    const char2 = await saveCharacter({
      name: "My Character",
      class: "Necromancer",
      level: 1,
      paragonAllocation: { paragonLevel: 0, boards: [] },
      skillSelections: [],
      equippedItems: {},
      playstyleConstraints: [],
    });

    expect(char1.id).toBe("my-character");
    expect(char2.id).toBe("my-character-2");
  });

  it("atomic write uses temp file pattern", async () => {
    const { atomicWriteJson } = await import("../lib/persistence");
    const filePath = path.join(tmpDir, "test-atomic.json");
    await atomicWriteJson(filePath, { hello: "world" });
    const content = await fs.readFile(filePath, "utf-8");
    expect(JSON.parse(content)).toEqual({ hello: "world" });
    // Temp file should be cleaned up
    const dir = await fs.readdir(tmpDir);
    const tmpFiles = dir.filter((f) => f.includes(".tmp."));
    expect(tmpFiles).toHaveLength(0);
  });
});
