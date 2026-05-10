/**
 * Acceptance tests for POST /api/triage/parse (S7).
 *
 * vi.mock() is NOT used for route handler interception in this file.
 * Next.js compiles route handlers through its own module evaluation system
 * (independent of Node.js require()), so Vitest's module registry patch
 * does not reach the route handler's imports. Tests use filesystem seeding
 * instead:
 *
 *  - Cache hit  → seed both file + cache entry on disk; route finds cache
 *                 hit and returns { cached: true } without calling LLM.
 *  - Cache miss → seed file only (no cache entry); real cropForVision runs;
 *                 real extractItemsFromImage throws (no ANTHROPIC_API_KEY) → 500.
 *  - D16        → pre-write corrupt cache JSON; route handles the JSON parse
 *                 error as non-fatal (D16), falls through to crop + LLM → 500
 *                 with an LLM error (not a "SyntaxError" or "JSON" error),
 *                 proving the corrupted cache was caught and execution continued.
 *
 * ANTHROPIC_API_KEY is deliberately NOT set (harness D20). Any route code path
 * that reaches extractItemsFromImage gets a loud throw from the real
 * implementation, surfacing accidental uncached paths as 500 responses.
 *
 * Covers:
 *  - Cache hit:  200, { hash, cached: true, entry }
 *  - Cache miss: 500, LLM error message (ANTHROPIC_API_KEY not set)
 *  - D16 corrupted cache: 500 with LLM error (not a JSON parse error)
 *  - Missing file: 404
 *  - Invalid body: 400
 *  - Non-JSON body: 400
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

  it("cache miss: real LLM called (no API key) → 500 with LLM error, not a crop or FS error", async () => {
    const filename = `parse-miss-${randomUUID().slice(0, 8)}.png`;
    // Use unique bytes to guarantee a fresh hash with no pre-existing cache entry.
    // Other tests (e.g. upload) may pre-seed FAKE_PNG's hash; unique bytes avoid
    // cross-test cache pollution.
    const uniqueBytes = Buffer.concat([FAKE_PNG, Buffer.from(randomUUID())]);
    await seedFile(filename, uniqueBytes);

    // ANTHROPIC_API_KEY is not set → extractItemsFromImage throws → route returns 500
    const { json } = await expectFetch(
      `${baseUrl}/api/triage/parse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      },
      500
    );
    // The error message originates from extractItemsFromImage (LLM layer),
    // not from sharp, filesystem, or JSON parsing.
    const body = json<{ error: string }>();
    expect(body.error).toMatch(/ANTHROPIC_API_KEY|API key|authentication/i);
  });

  it("corrupted cache (D16): cache-read error is non-fatal; falls through to LLM error, not JSON error", async () => {
    const filename = `parse-corrupt-${randomUUID().slice(0, 8)}.png`;
    const hash = await seedFile(filename);

    // Pre-write truncated JSON to the cache path — simulates a mid-write crash (D16)
    const cacheDir = path.join(tmpDir, "screenshot-cache");
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, `${hash}.json`), "{");

    // Route must catch the JSON parse error (non-fatal, D16), fall through to
    // crop + LLM, and propagate the LLM error — NOT the JSON parse error.
    const { json } = await expectFetch(
      `${baseUrl}/api/triage/parse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      },
      500
    );
    const body = json<{ error: string }>();
    // LLM error proves execution reached extractItemsFromImage (cache-read error was caught)
    expect(body.error).toMatch(/ANTHROPIC_API_KEY|API key|authentication/i);
    // Must NOT be a JSON parse error (that would mean D16 non-fatal handling is broken)
    expect(body.error).not.toMatch(/SyntaxError|JSON\.parse|Unexpected token/i);
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
});
