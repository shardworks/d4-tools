/**
 * Persistence resolver tests.
 *
 * Exercises the saveCharacter write-time canonicalization path (D4) and verifies
 * that the fixture-driven round-trip correctly resolves `warl_molten_bomb` → `warl_lava_bomb`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as fssync from "fs";
import * as path from "path";
import * as os from "os";
import { findSkillById } from "../lib/catalog";

const FIXTURE_PATH = path.resolve(__dirname, "./fixtures/character-with-old-skill-ids.json");

describe("legacy skill id: fixture content", () => {
  it("fixture carries skillId warl_molten_bomb with rank 5", () => {
    const data = JSON.parse(fssync.readFileSync(FIXTURE_PATH, "utf-8"));
    expect(data.skillSelections).toHaveLength(1);
    expect(data.skillSelections[0].skillId).toBe("warl_molten_bomb");
    expect(data.skillSelections[0].rank).toBe(5);
  });

  it("resolver maps warl_molten_bomb to warl_lava_bomb (Lava Bomb)", () => {
    const data = JSON.parse(fssync.readFileSync(FIXTURE_PATH, "utf-8"));
    const skillSel = data.skillSelections[0];
    const resolved = findSkillById("Warlock", skillSel.skillId);
    expect(resolved).toBeTruthy();
    expect(resolved!.id).toBe("warl_lava_bomb");
    expect(resolved!.label).toBe("Lava Bomb");
  });

  it("resolved rank 5 is attributed to Lava Bomb (budget simulation)", () => {
    const data = JSON.parse(fssync.readFileSync(FIXTURE_PATH, "utf-8"));
    let lavaBombRank = 0;
    for (const sel of data.skillSelections) {
      const entry = findSkillById("Warlock", sel.skillId);
      if (entry?.id === "warl_lava_bomb") {
        lavaBombRank += sel.rank;
      }
    }
    expect(lavaBombRank).toBe(5);
  });
});

describe("saveCharacter write-time canonicalization", () => {
  let tmpDir: string;
  const origDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "d4-resolver-test-"));
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    process.env.DATA_DIR = origDataDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("canonicalizes warl_molten_bomb → warl_lava_bomb on write", async () => {
    const { saveCharacter, loadCharacter } = await import("../lib/persistence/characters");

    const saved = await saveCharacter({
      name: "Legacy Warlock",
      class: "Warlock",
      level: 50,
      paragonAllocation: { paragonLevel: 0, boards: [] },
      skillSelections: [{ skillId: "warl_molten_bomb", rank: 5, slot: "basic" }],
      equippedItems: {},
      playstyleConstraints: [],
    });

    // In-memory return should already be canonicalized
    expect(saved.skillSelections).toHaveLength(1);
    expect(saved.skillSelections[0].skillId).toBe("warl_lava_bomb");
    expect(saved.skillSelections[0].rank).toBe(5);

    // On-disk JSON must carry the canonical id
    const loaded = await loadCharacter(saved.id);
    expect(loaded).toBeTruthy();
    expect(loaded!.skillSelections).toHaveLength(1);
    expect(loaded!.skillSelections[0].skillId).toBe("warl_lava_bomb");
    expect(loaded!.skillSelections[0].rank).toBe(5);
  });

  it("drops unresolvable skill ids and emits a console.warn", async () => {
    const { saveCharacter } = await import("../lib/persistence/characters");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const saved = await saveCharacter({
        name: "Missing Skill Barbarian",
        class: "Barbarian",
        level: 30,
        paragonAllocation: { paragonLevel: 0, boards: [] },
        skillSelections: [{ skillId: "barb_unbridled_rage", rank: 3, slot: "key-passive" }],
        equippedItems: {},
        playstyleConstraints: [],
      });

      expect(saved.skillSelections).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("barb_unbridled_rage")
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("preserves canonical ids unchanged on save", async () => {
    const { saveCharacter, loadCharacter } = await import("../lib/persistence/characters");

    const saved = await saveCharacter({
      name: "Clean Warlock",
      class: "Warlock",
      level: 50,
      paragonAllocation: { paragonLevel: 0, boards: [] },
      skillSelections: [{ skillId: "warl_lava_bomb", rank: 3, slot: "basic" }],
      equippedItems: {},
      playstyleConstraints: [],
    });

    const loaded = await loadCharacter(saved.id);
    expect(loaded!.skillSelections[0].skillId).toBe("warl_lava_bomb");
    expect(loaded!.skillSelections[0].rank).toBe(3);
  });
});
