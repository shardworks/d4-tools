/**
 * Acceptance tests for GET /api/triage/cache/[hash] (S8).
 *
 * Covers:
 *  - 200 with cache entry when the hash exists on disk
 *  - 404 when the hash is not found
 *  - 400 for an invalid (non-hex-64) hash format
 *
 * No vi.mock() needed — this route only reads the filesystem cache.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import {
  setupAcceptance,
  baseUrl,
  tmpDir,
  expectFetch,
  makeCacheEntry,
} from "./harness";

setupAcceptance();

/** Fake SHA-256 hex: 64 lowercase hex characters. */
function fakeHash(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 32);
}

/** Write a cache entry JSON under DATA_DIR/screenshot-cache/<hash>.json. */
async function seedCacheEntry(hash: string): Promise<void> {
  const cacheDir = path.join(tmpDir, "screenshot-cache");
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(
    path.join(cacheDir, `${hash}.json`),
    JSON.stringify(makeCacheEntry())
  );
}

describe("GET /api/triage/cache/[hash]", () => {
  it("returns 200 with the cache entry when the hash exists", async () => {
    const hash = fakeHash();
    await seedCacheEntry(hash);

    const { json } = await expectFetch(
      `${baseUrl}/api/triage/cache/${hash}`,
      {},
      200
    );
    const entry = json<{ kind: string; model: string }>();
    expect(entry.kind).toBe("item");
    expect(entry.model).toBe("test-model");
  });

  it("returns 404 when the hash is not found", async () => {
    const hash = fakeHash();
    // No cache entry seeded — should return 404
    await expectFetch(`${baseUrl}/api/triage/cache/${hash}`, {}, 404);
  });

  it("returns 400 for an invalid hash format (too short)", async () => {
    await expectFetch(`${baseUrl}/api/triage/cache/abc123`, {}, 400);
  });

  it("returns 400 for an invalid hash format (non-hex characters)", async () => {
    const badHash = "x".repeat(64); // 'x' is not valid hex
    await expectFetch(`${baseUrl}/api/triage/cache/${badHash}`, {}, 400);
  });

  it("returns 400 for an invalid hash format (uppercase hex)", async () => {
    // The route pattern requires lowercase hex
    const upperHash = "A".repeat(64);
    await expectFetch(`${baseUrl}/api/triage/cache/${upperHash}`, {}, 400);
  });
});
