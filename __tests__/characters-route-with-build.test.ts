/**
 * Regression tests for POST /api/characters?withDefaultBuild=true — composite branch.
 *
 * Covers:
 * (a) Happy path — 201 { character, build }, both files on disk, build defaults correct.
 * (b) No-orphan invariant — saveBuild throws → 500, characters dir has zero files.
 * (c) Double-failure transparency — saveBuild AND deleteCharacter throw → 500,
 *     response body names the build-failure cause, orphan id, and orphan path;
 *     both errors logged to stderr.
 * (d) Non-regression — solo path (no query param) still returns 201 with just the
 *     Character; no build file written.
 *
 * Uses vi.mock("@/lib/persistence", ...) to spy on saveBuild and deleteCharacter
 * while keeping all other persistence functions (saveCharacter, listCharacters, …)
 * as real implementations. Module isolation is guaranteed by Vitest's per-file
 * worker boundary, so the mock does not affect other test files.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// Partial mock: spy on saveBuild and deleteCharacter; keep everything else real.
// vi.mock is hoisted above all imports, so the mocked module is in place before
// any dynamic import of the route inside the test cases.
vi.mock("@/lib/persistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/persistence")>();
  return {
    ...actual,
    saveBuild: vi.fn(
      (...args: Parameters<typeof actual.saveBuild>) => actual.saveBuild(...args)
    ),
    deleteCharacter: vi.fn(
      (...args: Parameters<typeof actual.deleteCharacter>) => actual.deleteCharacter(...args)
    ),
  };
});

describe("POST /api/characters?withDefaultBuild=true — composite branch", () => {
  let tmpDir: string;
  const origDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    vi.clearAllMocks(); // reset call counts; implementations (real call-through) are preserved
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "d4-chars-with-build-test-"));
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    process.env.DATA_DIR = origDataDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── (a) Happy path ──────────────────────────────────────────────────────────

  it("(a) returns 201 with { character, build }, both files on disk, build defaults correct", async () => {
    const { POST } = await import("../app/api/characters/route");

    const request = new Request(
      "http://localhost/api/characters?withDefaultBuild=true",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bone Spear Necromancer", class: "Necromancer", level: 70 }),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(201);

    const json = await response.json();
    expect(json.character).toBeDefined();
    expect(json.build).toBeDefined();

    // Character fields
    expect(json.character.name).toBe("Bone Spear Necromancer");
    expect(json.character.id).toMatch(/^[a-z0-9-]+$/);

    // Build defaults (D4) — server-derived from character
    expect(json.build.name).toBe("Bone Spear Necromancer");
    expect(json.build.notes).toBe("");
    expect(json.build.targetItems).toEqual({});
    expect(json.build.characterId).toBe(json.character.id);

    // Both files on disk
    const charFile = path.join(tmpDir, "characters", `${json.character.id}.json`);
    const buildFile = path.join(tmpDir, "builds", `${json.build.id}.json`);
    expect(await fs.stat(charFile).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.stat(buildFile).then(() => true).catch(() => false)).toBe(true);
  });

  // ── (b) No-orphan invariant ─────────────────────────────────────────────────

  it("(b) no-orphan invariant: 500, characters dir empty when saveBuild throws", async () => {
    const { saveBuild } = await import("@/lib/persistence");
    vi.mocked(saveBuild).mockRejectedValueOnce(new Error("Simulated build failure"));

    const { POST } = await import("../app/api/characters/route");

    const request = new Request(
      "http://localhost/api/characters?withDefaultBuild=true",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Fire Ball Sorcerer", class: "Sorcerer", level: 60 }),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(500);

    // Characters directory must contain zero JSON files — rollback succeeded
    const charsDir = path.join(tmpDir, "characters");
    const entries = await fs.readdir(charsDir).catch(() => []);
    expect(entries.filter((e) => e.endsWith(".json"))).toHaveLength(0);
  });

  // ── (c) Double-failure transparency ────────────────────────────────────────

  it("(c) double-failure: 500 with orphan id, path, and both error causes; both errors on stderr", async () => {
    const { saveBuild, deleteCharacter } = await import("@/lib/persistence");
    vi.mocked(saveBuild).mockRejectedValueOnce(new Error("Simulated build failure"));
    vi.mocked(deleteCharacter).mockRejectedValueOnce(new Error("Simulated delete failure"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("../app/api/characters/route");

    const request = new Request(
      "http://localhost/api/characters?withDefaultBuild=true",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Earthquake Barbarian", class: "Barbarian", level: 80 }),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(500);

    const json = await response.json();
    // Response surfaces the build-failure cause
    expect(json.error).toContain("Simulated build failure");
    // Response names the orphaned character id
    expect(json.error).toContain("earthquake-barbarian");
    // Response includes the file path (contains the "characters" directory segment)
    expect(json.error).toMatch(/characters[/\\]earthquake-barbarian\.json/);

    // Both errors logged to stderr
    expect(errorSpy).toHaveBeenCalledTimes(2);

    errorSpy.mockRestore();
  });

  // ── (d) Non-regression: solo path ──────────────────────────────────────────

  it("(d) solo path (no query param): 201 with just Character, no build file written", async () => {
    const { POST } = await import("../app/api/characters/route");

    const request = new Request("http://localhost/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ball Lightning Sorcerer", class: "Sorcerer", level: 50 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const json = await response.json();
    // Response is a flat Character (not { character, build })
    expect(json.id).toBeDefined();
    expect(json.name).toBe("Ball Lightning Sorcerer");
    expect(json.character).toBeUndefined();
    expect(json.build).toBeUndefined();

    // No build file should have been written
    const buildsDir = path.join(tmpDir, "builds");
    const entries = await fs.readdir(buildsDir).catch(() => []);
    expect(entries.filter((e) => e.endsWith(".json"))).toHaveLength(0);
  });
});
