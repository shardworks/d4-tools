import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { sha256 } from "../lib/triage/hash";
import type { CacheEntry } from "../lib/triage/types";

describe("sha256", () => {
  it("returns a 64-character hex string", () => {
    const bytes = Buffer.from("hello world");
    const hash = sha256(bytes);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic — same bytes produce same hash", () => {
    const bytes = Buffer.from("diablo 4 loot screenshot");
    expect(sha256(bytes)).toBe(sha256(bytes));
  });

  it("produces different hashes for different inputs", () => {
    const h1 = sha256(Buffer.from("item A"));
    const h2 = sha256(Buffer.from("item B"));
    expect(h1).not.toBe(h2);
  });

  it("known SHA-256 hash — empty buffer", () => {
    // SHA-256("") = e3b0c44298fc1c149afb...
    const hash = sha256(Buffer.alloc(0));
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("cache round-trip (DATA_DIR-dependent)", () => {
  let tmpDir: string;
  const origDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "d4-triage-cache-test-"));
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    process.env.DATA_DIR = origDataDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writeCachedParse then getCachedParse returns equal entry (item kind)", async () => {
    const { getCachedParse, writeCachedParse } = await import("../lib/triage/cache");

    const hash = "a".repeat(64);
    const entry: CacheEntry = {
      kind: "item",
      items: [
        {
          name: "Harlequin Crest",
          itemType: "Helm",
          rarity: "unique",
          itemPower: 925,
          isAncestral: false,
          implicits: [],
          explicits: [{ label: "Maximum Life", rolledValue: 2800 }],
          tempered: [],
        },
      ],
      model: "claude-sonnet-4-5-20250929",
      timestamp: "2026-05-08T12:00:00.000Z",
    };

    await writeCachedParse(hash, entry);
    const loaded = await getCachedParse(hash);

    expect(loaded).not.toBeNull();
    expect(loaded!.kind).toBe("item");
    if (loaded!.kind === "item") {
      expect(loaded!.items).toHaveLength(1);
      expect(loaded!.items[0].name).toBe("Harlequin Crest");
      expect(loaded!.model).toBe("claude-sonnet-4-5-20250929");
    }
  });

  it("writeCachedParse then getCachedParse returns equal entry (no-item-detected kind)", async () => {
    const { getCachedParse, writeCachedParse } = await import("../lib/triage/cache");

    const hash = "b".repeat(64);
    const entry: CacheEntry = {
      kind: "no-item-detected",
      model: "claude-sonnet-4-5-20250929",
      timestamp: "2026-05-08T12:00:00.000Z",
    };

    await writeCachedParse(hash, entry);
    const loaded = await getCachedParse(hash);

    expect(loaded).not.toBeNull();
    expect(loaded!.kind).toBe("no-item-detected");
  });

  it("getCachedParse returns null on cache miss (ENOENT)", async () => {
    const { getCachedParse } = await import("../lib/triage/cache");
    const result = await getCachedParse("c".repeat(64));
    expect(result).toBeNull();
  });

  it("cache files are stored under DATA_DIR/screenshot-cache/", async () => {
    const { writeCachedParse } = await import("../lib/triage/cache");

    const hash = "d".repeat(64);
    const entry: CacheEntry = {
      kind: "no-item-detected",
      model: "claude-sonnet-4-5-20250929",
      timestamp: "2026-05-08T12:00:00.000Z",
    };

    await writeCachedParse(hash, entry);

    const expectedPath = path.join(tmpDir, "screenshot-cache", `${hash}.json`);
    const fileExists = await fs.stat(expectedPath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);
  });

  it("hash is content-addressed — same file bytes produce same cache key", () => {
    const bytes = Buffer.from("fake png bytes 12345");
    const hash1 = sha256(bytes);
    const hash2 = sha256(bytes);
    expect(hash1).toBe(hash2);
  });

  it("renaming the file does not change the hash", () => {
    const bytes = Buffer.from("same content");
    const hashA = sha256(bytes);
    // Simulated: rename has no effect on content
    const hashB = sha256(bytes);
    expect(hashA).toBe(hashB);
  });
});
