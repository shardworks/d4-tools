/**
 * Acceptance tests for POST /api/triage/parse (S7).
 *
 * vi.mock() is NOT used for route handler interception in this file.
 * Next.js compiles route handlers through its own module evaluation system
 * (independent of Node.js require()), so Vitest's module registry patch
 * does not reach the route handler's imports. Tests use filesystem seeding
 * and the stub Anthropic server instead:
 *
 *  - Cache hit  → seed both file + cache entry on disk; route finds cache
 *                 hit and returns { cached: true } without calling LLM.
 *  - Cache miss → seed file only (no cache entry); use withAnthropicSuccess()
 *                 so the stub returns a valid LLM response → 200 with entry.
 *  - D16        → pre-write corrupt cache JSON; route handles the JSON parse
 *                 error as non-fatal (D16), falls through to crop + LLM stub
 *                 (success), proving the corrupted cache was caught.
 *
 * The stub Anthropic server (harness D1) defaults to returning 401 (invalid
 * API key), surfacing accidental uncached paths as errors. Use
 * withAnthropicSuccess(items, fn) for tests that need the LLM to succeed.
 *
 * Covers:
 *  - Cache hit:  200, { hash, cached: true, entry }
 *  - Cache miss: 200, LLM stub called, cache entry written
 *  - D16 corrupted cache: 200 with LLM stub success (not a JSON parse error)
 *  - Missing file: 404
 *  - Invalid body: 400
 *  - Non-JSON body: 400
 *  - Unsupported file extension: 400
 *  - Path-traversal filename: 400
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import {
  setupAcceptance,
  baseUrl,
  screenshotDir,
  tmpDir,
  expectFetch,
  makeCacheEntry,
  withAnthropicSuccess,
  FAKE_PNG,
} from "./harness";
import { sha256 } from "../../lib/triage/hash";

setupAcceptance();

/** Write a screenshot file and return its hash. */
async function seedFile(filename: string, content: Buffer = FAKE_PNG): Promise<string> {
  await fs.writeFile(path.join(screenshotDir, filename), content);
  return sha256(content);
}

/** Write a valid cache entry JSON for the given hash. */
async function seedCache(hash: string): Promise<void> {
  const cacheDir = path.join(tmpDir, "screenshot-cache");
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(
    path.join(cacheDir, `${hash}.json`),
    JSON.stringify(makeCacheEntry())
  );
}

describe("POST /api/triage/parse", () => {
  it("cache hit: skips crop + LLM, returns { hash, cached: true, entry }", async () => {
    const filename = `parse-hit-${randomUUID().slice(0, 8)}.png`;
    const hash = await seedFile(filename);
    await seedCache(hash);

    // Route finds pre-seeded cache entry → short-circuits crop + LLM → 200
    const { json } = await expectFetch(
      `${baseUrl}/api/triage/parse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      },
      200
    );
    const body = json<{ hash: string; cached: boolean; entry: unknown }>();
    expect(body.hash).toBe(hash);
    expect(body.cached).toBe(true);
    expect(body.entry).toBeDefined();
  });

  it("cache miss: LLM called, entry written to cache, response carries parsed entry", async () => {
    const filename = `parse-miss-${randomUUID().slice(0, 8)}.png`;
    const uniqueBytes = Buffer.concat([FAKE_PNG, Buffer.from(randomUUID())]);
    await seedFile(filename, uniqueBytes);
    const expectedHash = sha256(uniqueBytes);

    // Stub returns success with no items (no-item-detected path)
    await withAnthropicSuccess([], async () => {
      const { json } = await expectFetch(
        `${baseUrl}/api/triage/parse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename }),
        },
        200
      );
      const body = json<{ hash: string; cached: boolean; entry: unknown }>();
      expect(body.hash).toBe(expectedHash);
      expect(body.cached).toBe(false);
      expect(body.entry).toBeDefined();
    });

    // Cache entry must have been written by the route
    const cachePath = path.join(tmpDir, "screenshot-cache", `${expectedHash}.json`);
    expect(
      await fs.stat(cachePath).then(() => true).catch(() => false)
    ).toBe(true);
  });

  it("corrupted cache (D16): cache-read error is non-fatal; falls through to LLM success", async () => {
    const filename = `parse-corrupt-${randomUUID().slice(0, 8)}.png`;
    const hash = await seedFile(filename);

    // Pre-write truncated JSON to the cache path — simulates a mid-write crash (D16)
    const cacheDir = path.join(tmpDir, "screenshot-cache");
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, `${hash}.json`), "{");

    // Route must catch the JSON parse error (non-fatal, D16), fall through to
    // crop + LLM (stub returns success). The response must NOT be a JSON error.
    await withAnthropicSuccess([], async () => {
      const { json } = await expectFetch(
        `${baseUrl}/api/triage/parse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename }),
        },
        200
      );
      const body = json<{ hash: string; cached: boolean; entry: unknown }>();
      // LLM success proves execution reached extractItemsFromImage (cache error was caught)
      expect(body.cached).toBe(false);
      expect(body.entry).toBeDefined();
      // Body must NOT be an error response (cache-read error was handled non-fatally)
      const bodyAny = body as unknown as { error?: string };
      expect(bodyAny.error).toBeUndefined();
    });
  });

  it("returns 404 when the screenshot file does not exist", async () => {
    await expectFetch(
      `${baseUrl}/api/triage/parse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: `missing-${randomUUID().slice(0, 8)}.png` }),
      },
      404
    );
  });

  it("returns 400 for an invalid body (missing filename field)", async () => {
    await expectFetch(
      `${baseUrl}/api/triage/parse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notFilename: "oops" }),
      },
      400
    );
  });

  it("returns 400 for a non-JSON body", async () => {
    await expectFetch(
      `${baseUrl}/api/triage/parse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json {",
      },
      400
    );
  });

  it("returns 400 for an unsupported file extension (.bmp)", async () => {
    // Seed a .bmp file so it passes the dir-listing check
    const filename = `parse-bmp-${randomUUID().slice(0, 8)}.bmp`;
    await fs.writeFile(path.join(screenshotDir, filename), Buffer.from("BM"));

    await expectFetch(
      `${baseUrl}/api/triage/parse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      },
      400
    );
  });

  it("returns 400 for a path-traversal filename (../etc/passwd)", async () => {
    await expectFetch(
      `${baseUrl}/api/triage/parse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "../etc/passwd" }),
      },
      400
    );
  });
});
