import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

describe("active-build pointer self-heals stale referents", () => {
  let tmpDir: string;
  const origDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "d4-test-active-build-"));
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    process.env.DATA_DIR = origDataDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  /** Write the active-build pointer file directly to disk. */
  async function writePointer(buildId: string): Promise<void> {
    await fs.writeFile(
      path.join(tmpDir, "active-build.json"),
      JSON.stringify({ buildId, updatedAt: new Date().toISOString() }),
      "utf-8"
    );
  }

  /** Write a minimal file at the build path so fs.access considers it present. */
  async function writeBuildFile(buildId: string): Promise<void> {
    const dir = path.join(tmpDir, "builds");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${buildId}.json`), JSON.stringify({ id: buildId }), "utf-8");
  }

  it("returns buildId unchanged and leaves pointer in place when build file exists", async () => {
    await writePointer("existing-build");
    await writeBuildFile("existing-build");

    const { getActiveBuildId } = await import("../lib/persistence/active-build");
    const result = await getActiveBuildId();
    expect(result).toBe("existing-build");

    // Pointer file must still be present — no self-heal occurred.
    const stat = await fs.stat(path.join(tmpDir, "active-build.json"));
    expect(stat.isFile()).toBe(true);
  });

  it("returns null and removes pointer when build file is missing", async () => {
    await writePointer("deleted-build");
    // Intentionally do NOT create the build file — this is the stale case.

    const { getActiveBuildId } = await import("../lib/persistence/active-build");
    const result = await getActiveBuildId();
    expect(result).toBeNull();

    // Pointer file must have been unlinked by the self-heal.
    await expect(fs.access(path.join(tmpDir, "active-build.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("returns null without error when no pointer file is present", async () => {
    // No pointer file at all — exercises the ENOENT-on-read branch.
    const { getActiveBuildId } = await import("../lib/persistence/active-build");
    const result = await getActiveBuildId();
    expect(result).toBeNull();
    // No side effects: builds dir should not have been created.
    await expect(fs.access(path.join(tmpDir, "active-build.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("tolerates ENOENT on unlink (race with concurrent writer/clearer) and returns null", async () => {
    await writePointer("race-build");
    // Stale — build file does NOT exist, so fs.access will throw ENOENT.

    // Simulate the race: a concurrent process removes the pointer file in the window
    // between getActiveBuildId detecting a stale referent (fs.access ENOENT) and its
    // own fs.unlink call.  We use vi.doMock (non-hoisted; supports closures) to inject
    // an fs.access that physically deletes the pointer file as a side effect and then
    // throws ENOENT.  The subsequent real fs.unlink call finds the file already gone and
    // throws ENOENT — which the code must tolerate (D5b).
    //
    // vi.spyOn cannot be used here because Node built-in module namespace objects are
    // non-configurable in ESM.  vi.doMock + vi.resetModules is the Vitest-recommended
    // alternative for this case.
    vi.resetModules();
    const capturedTmpDir = tmpDir; // capture before async gap
    vi.doMock("fs/promises", () => ({
      // Spread the real module (statically imported at the top of this file) so all
      // other fs functions remain unaffected.
      ...fs,
      access: vi.fn(async () => {
        // Remove the pointer file — simulates a concurrent writer beating us.
        await fs.rm(path.join(capturedTmpDir, "active-build.json"), { force: true });
        // Then throw ENOENT, which is what a missing build file would produce.
        const err = new Error("ENOENT: no such file or directory") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }),
    }));

    // Re-import after mock setup so active-build.ts picks up the mocked fs.
    const { getActiveBuildId } = await import("../lib/persistence/active-build");
    // Must not throw; must return null even though unlink found the file already gone.
    await expect(getActiveBuildId()).resolves.toBeNull();

    vi.doUnmock("fs/promises");
    vi.resetModules();
  });
});
