import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

/**
 * Wear persistence test.
 * Verifies that equippedItems[slot] is updated on the character file via PUT
 * /api/characters/[id] — mirrors the BuildDetailClient.handleItemSave pattern.
 *
 * No live Anthropic HTTP calls are made; fetch is not invoked here
 * (direct persistence layer test).
 */
describe("wear persistence (DATA_DIR-dependent)", () => {
  let tmpDir: string;
  const origDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "d4-triage-wear-test-"));
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    process.env.DATA_DIR = origDataDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("saveCharacter + update equippedItems + loadCharacter round-trips the item", async () => {
    const { saveCharacter, loadCharacter } = await import("../lib/persistence/characters");
    const { ItemSchema } = await import("../lib/schema");

    // Save a character with no equipped items
    const char = await saveCharacter({
      name: "Test Rogue",
      class: "Rogue",
      level: 80,
      paragonAllocation: { paragonLevel: 0, boards: [] },
      skillSelections: [],
      equippedItems: {},
      playstyleConstraints: [],
    });

    // Build a valid item
    const item = ItemSchema.parse({
      slot: "helm",
      name: "Harlequin Crest",
      rarity: "unique",
      itemPower: 925,
      isAncestral: false,
      implicits: [],
      explicits: [{ affixId: "affix_max_life", rolledValue: 2800 }],
      tempered: [],
      masterworkRank: 0,
      runes: [],
      sockets: [],
    });

    // Simulate the wear action: update equippedItems + save
    const updated = {
      ...char,
      equippedItems: { ...char.equippedItems, helm: item },
      updatedAt: new Date().toISOString(),
    };
    await saveCharacter(updated);

    // Reload from disk
    const reloaded = await loadCharacter(char.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.equippedItems.helm).toBeDefined();
    expect(reloaded!.equippedItems.helm!.name).toBe("Harlequin Crest");
    expect(reloaded!.equippedItems.helm!.rarity).toBe("unique");
    expect(reloaded!.equippedItems.helm!.explicits[0].affixId).toBe("affix_max_life");
    expect(reloaded!.equippedItems.helm!.explicits[0].rolledValue).toBe(2800);
  });

  it("wear replaces existing equipped item in the same slot", async () => {
    const { saveCharacter, loadCharacter } = await import("../lib/persistence/characters");
    const { ItemSchema } = await import("../lib/schema");

    const oldItem = ItemSchema.parse({
      slot: "helm",
      name: "Old Helm",
      rarity: "rare",
      itemPower: 700,
      isAncestral: false,
      implicits: [],
      explicits: [{ affixId: "affix_str", rolledValue: 100 }],
      tempered: [],
      masterworkRank: 0,
      runes: [],
      sockets: [],
    });

    const char = await saveCharacter({
      name: "Test Sorcerer",
      class: "Sorcerer",
      level: 100,
      paragonAllocation: { paragonLevel: 0, boards: [] },
      skillSelections: [],
      equippedItems: { helm: oldItem },
      playstyleConstraints: [],
    });

    const newItem = ItemSchema.parse({
      slot: "helm",
      name: "Harlequin Crest",
      rarity: "unique",
      itemPower: 925,
      isAncestral: false,
      implicits: [],
      explicits: [{ affixId: "affix_max_life", rolledValue: 2800 }],
      tempered: [],
      masterworkRank: 0,
      runes: [],
      sockets: [],
    });

    // Wear the new item
    await saveCharacter({
      ...char,
      equippedItems: { ...char.equippedItems, helm: newItem },
      updatedAt: new Date().toISOString(),
    });

    const reloaded = await loadCharacter(char.id);
    expect(reloaded!.equippedItems.helm!.name).toBe("Harlequin Crest");
    expect(reloaded!.equippedItems.helm!.rarity).toBe("unique");
  });

  it("wear change survives a server restart (persists to disk atomically)", async () => {
    const { saveCharacter } = await import("../lib/persistence/characters");
    const { atomicWriteJson } = await import("../lib/persistence");
    const { ItemSchema, CharacterSchema } = await import("../lib/schema");

    const char = await saveCharacter({
      name: "Druid Test",
      class: "Druid",
      level: 60,
      paragonAllocation: { paragonLevel: 0, boards: [] },
      skillSelections: [],
      equippedItems: {},
      playstyleConstraints: [],
    });

    const item = ItemSchema.parse({
      slot: "amulet",
      name: "Insatiable Fury",
      rarity: "unique",
      itemPower: 900,
      isAncestral: false,
      implicits: [],
      explicits: [{ affixId: "affix_int", rolledValue: 195 }],
      tempered: [],
      masterworkRank: 0,
      runes: [],
      sockets: [],
    });

    const updated = CharacterSchema.parse({
      ...char,
      equippedItems: { amulet: item },
      updatedAt: new Date().toISOString(),
    });

    // Write atomically (simulating PUT /api/characters/[id])
    const charPath = path.join(tmpDir, "characters", `${char.id}.json`);
    await atomicWriteJson(charPath, updated);

    // Read raw file to confirm persistence
    const raw = await fs.readFile(charPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.equippedItems.amulet).toBeDefined();
    expect(parsed.equippedItems.amulet.name).toBe("Insatiable Fury");

    // No tmp file left
    const dir = await fs.readdir(path.join(tmpDir, "characters"));
    const tmpFiles = dir.filter((f) => f.includes(".tmp."));
    expect(tmpFiles).toHaveLength(0);
  });
});

describe("Anthropic fetch stubbing (D28 — no live HTTP)", () => {
  it("extractItemsFromImage uses fetch and can be stubbed (no real network call)", async () => {
    // Set up a fake API key and stub fetch
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";

    const helmFixture = await fs.readFile(
      path.join(__dirname, "fixtures/triage/helm-item.json"),
      "utf-8"
    );

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => JSON.parse(helmFixture),
    });

    vi.stubGlobal("fetch", mockFetch);

    const { extractItemsFromImage } = await import("../lib/triage/anthropic");
    const bytes = Buffer.from("fake png bytes");
    const result = await extractItemsFromImage(bytes, "image/png");

    // Verify fetch was called once
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify result uses fixture data
    expect(result.kind).toBe("item");
    if (result.kind === "item") {
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("Harlequin Crest");
      expect(result.items[0].itemType).toBe("Helm");
    }

    // Verify NO real Anthropic URL was called
    const [callUrl] = mockFetch.mock.calls[0] as [string];
    expect(callUrl).toContain("anthropic.com");
    // The mock was called with anthropic.com URL (but resolved to fixture, not real API)

    process.env.ANTHROPIC_API_KEY = undefined;
  });

  it("returns no-item-detected for empty items array fixture", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";

    const noItemFixture = await fs.readFile(
      path.join(__dirname, "fixtures/triage/no-item-detected.json"),
      "utf-8"
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => JSON.parse(noItemFixture),
    }));

    const { extractItemsFromImage } = await import("../lib/triage/anthropic");
    const result = await extractItemsFromImage(Buffer.from("empty"), "image/jpeg");

    expect(result.kind).toBe("no-item-detected");

    process.env.ANTHROPIC_API_KEY = undefined;
  });

  it("throws on API error (status 500)", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }));

    const { extractItemsFromImage } = await import("../lib/triage/anthropic");
    await expect(
      extractItemsFromImage(Buffer.from("err"), "image/png")
    ).rejects.toThrow("500");

    process.env.ANTHROPIC_API_KEY = undefined;
  });
});
