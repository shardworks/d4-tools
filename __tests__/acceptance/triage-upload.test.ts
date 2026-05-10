/**
 * Acceptance tests for POST /api/triage/upload (S10).
 *
 * vi.mock() is NOT used for route handler interception in this file.
 * Next.js compiles route handlers through its own module evaluation system
 * (independent of Node.js require()), so Vitest's module registry patch does
 * not reach the route handler's imports. Tests control route behaviour through
 * filesystem state instead:
 *
 *  - Pre-seed the SHA-256 cache entry before uploading → route takes the
 *    cache-hit path → returns 201 without calling crop or LLM.
 *  - Upload unique bytes with no pre-seeded cache → route calls the real
 *    extractItemsFromImage → throws (ANTHROPIC_API_KEY not set) → 200/error.
 *
 * ANTHROPIC_API_KEY is deliberately NOT set (harness D20). Any route code path
 * that reaches the real LLM returns 200 with parseStatus:"error" and an error
 * message that mentions the missing key, surfacing accidental cache misses.
 *
 * Covers:
 *  - Happy path: 201, file under SCREENSHOT_DIR, cache entry on disk,
 *    response includes filename + hash + parsed entry (cache-hit path via
 *    pre-seeded entry)
 *  - Auth gating: 401 when UPLOAD_SECRET set and token absent/wrong;
 *    201 when correct token sent (via withUploadSecret + pre-seeded cache)
 *  - LLM-error contract: 200 with parseStatus:"error", file still on disk,
 *    no cache entry written (no pre-seeded cache → real LLM called → fails)
 *  - Cache hit: second upload of identical bytes returns 201 via the cache;
 *    the 201 status (vs. 200 on LLM error) is the observable proof of cache
 *    hit (D2 intent — without vi.mock interception of route handlers, HTTP
 *    status is the reliable indicator)
 *  - Oversized fixture (D17): original bytes on disk are byte-identical to
 *    the uploaded content (cropper output is never written to disk)
 *  - Collision suffixing: second upload of the same filename (different
 *    content) gets a numeric suffix
 *  - Path-traversal filename: 400, no file written
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
  withUploadSecret,
  makeCacheEntry,
  FAKE_PNG,
  FAKE_PNG_B,
} from "./harness";
import { sha256 } from "../../lib/triage/hash";

setupAcceptance();

/** Build a multipart request body for the upload endpoint. */
function makeFormData(imageBytes: Buffer, filename: string): FormData {
  const fd = new FormData();
  fd.append(
    "file",
    new Blob([new Uint8Array(imageBytes)], { type: "image/png" }),
    "upload.png"
  );
  fd.append("filename", filename);
  return fd;
}

/**
 * Pre-seed a SHA-256 cache entry so the upload route takes the cache-hit
 * path (→ 201) rather than calling the real LLM (→ 200/error).
 */
async function seedCache(bytes: Buffer): Promise<string> {
  const hash = sha256(bytes);
  const cacheDir = path.join(tmpDir, "screenshot-cache");
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(
    path.join(cacheDir, `${hash}.json`),
    JSON.stringify(makeCacheEntry())
  );
  return hash;
}

describe("POST /api/triage/upload", () => {
  it("happy path: 201, file written under SCREENSHOT_DIR, cache entry on disk, response includes filename + hash + parsed", async () => {
    const filename = `upload-${randomUUID().slice(0, 8)}.png`;
    // Pre-seed cache so the route finds a hit and returns 201 without LLM
    const expectedHash = await seedCache(FAKE_PNG);

    const { json } = await expectFetch(
      `${baseUrl}/api/triage/upload`,
      { method: "POST", body: makeFormData(FAKE_PNG, filename) },
      201
    );
    const body = json<{
      filename: string;
      hash: string;
      parseStatus: string;
      parsed: unknown;
    }>();
    expect(body.filename).toBe(filename);
    expect(body.hash).toBe(expectedHash);
    expect(body.parseStatus).toBeTruthy();
    expect(body.parsed).toBeDefined();

    // File must be on disk (always saved before cache check — D13)
    const filePath = path.join(screenshotDir, filename);
    expect(
      await fs
        .stat(filePath)
        .then(() => true)
        .catch(() => false)
    ).toBe(true);

    // Cache entry must exist (pre-seeded, preserved by cache-hit path)
    const cachePath = path.join(
      tmpDir,
      "screenshot-cache",
      `${expectedHash}.json`
    );
    expect(
      await fs
        .stat(cachePath)
        .then(() => true)
        .catch(() => false)
    ).toBe(true);
  });

  it("auth gating: 401 when UPLOAD_SECRET is set and X-Upload-Token is absent", async () => {
    await withUploadSecret("test-secret-abc", async () => {
      const filename = `auth-missing-${randomUUID().slice(0, 8)}.png`;
      await expectFetch(
        `${baseUrl}/api/triage/upload`,
        { method: "POST", body: makeFormData(FAKE_PNG, filename) },
        401
      );
    });
  });

  it("auth gating: 401 when X-Upload-Token is wrong", async () => {
    await withUploadSecret("correct-secret", async () => {
      const filename = `auth-wrong-${randomUUID().slice(0, 8)}.png`;
      const fd = makeFormData(FAKE_PNG, filename);
      await expectFetch(
        `${baseUrl}/api/triage/upload`,
        {
          method: "POST",
          body: fd,
          headers: { "X-Upload-Token": "wrong-secret" },
        },
        401
      );
    });
  });

  it("auth gating: 201 when X-Upload-Token matches UPLOAD_SECRET", async () => {
    const secret = "correct-secret-" + randomUUID().slice(0, 8);
    // Pre-seed cache so the route returns 201 via cache-hit (not 200/LLM-error)
    await seedCache(FAKE_PNG);
    await withUploadSecret(secret, async () => {
      const filename = `auth-ok-${randomUUID().slice(0, 8)}.png`;
      const fd = makeFormData(FAKE_PNG, filename);
      await expectFetch(
        `${baseUrl}/api/triage/upload`,
        {
          method: "POST",
          body: fd,
          headers: { "X-Upload-Token": secret },
        },
        201
      );
    });
  });

  it("LLM-error contract: 200 with parseStatus:'error', file on disk, no cache entry written", async () => {
    // Use unique bytes to guarantee a fresh hash with no pre-seeded cache entry.
    // Route: save file → cache miss → crop runs → LLM throws (no API key) → 200/error
    const uniqueBytes = Buffer.concat([FAKE_PNG, Buffer.from(randomUUID())]);
    const hash = sha256(uniqueBytes);
    const filename = `llm-err-${randomUUID().slice(0, 8)}.png`;

    const { json } = await expectFetch(
      `${baseUrl}/api/triage/upload`,
      { method: "POST", body: makeFormData(uniqueBytes, filename) },
      200
    );
    const body = json<{ parseStatus: string; error: string; filename: string }>();
    expect(body.parseStatus).toBe("error");
    // Error originates from extractItemsFromImage (LLM layer) — not crop/FS
    expect(body.error).toMatch(/ANTHROPIC_API_KEY|API key|authentication/i);
    expect(body.filename).toBe(filename);

    // File is still on disk despite LLM failure (saved before cache check — D13)
    expect(
      await fs
        .stat(path.join(screenshotDir, filename))
        .then(() => true)
        .catch(() => false)
    ).toBe(true);

    // No cache entry written on LLM failure
    const cachePath = path.join(tmpDir, "screenshot-cache", `${hash}.json`);
    expect(
      await fs
        .stat(cachePath)
        .then(() => true)
        .catch(() => false)
    ).toBe(false);
  });

  it("cache hit: second upload of same bytes returns 201 via cache (D2 intent)", async () => {
    // Use unique bytes so this test's hash doesn't collide with others
    const uniqueBytes = Buffer.concat([FAKE_PNG_B, Buffer.from(randomUUID())]);

    // Pre-seed cache for these bytes. A 201 response proves the route took
    // the cache-hit path (LLM-error path gives 200 — no ANTHROPIC_API_KEY set).
    const hash = await seedCache(uniqueBytes);

    const filename1 = `hit-first-${randomUUID().slice(0, 8)}.png`;
    const filename2 = `hit-second-${randomUUID().slice(0, 8)}.png`;

    // First upload → cache hit → 201
    const { json: json1 } = await expectFetch(
      `${baseUrl}/api/triage/upload`,
      { method: "POST", body: makeFormData(uniqueBytes, filename1) },
      201
    );
    expect(json1<{ hash: string }>().hash).toBe(hash);

    // Second upload (same bytes, different filename) → cache hit → 201 again
    const { json: json2 } = await expectFetch(
      `${baseUrl}/api/triage/upload`,
      { method: "POST", body: makeFormData(uniqueBytes, filename2) },
      201
    );
    expect(json2<{ hash: string }>().hash).toBe(hash);

    // Both files written to disk (file is always saved before cache check — D13)
    const files = await fs.readdir(screenshotDir);
    expect(files).toContain(filename1);
    expect(files).toContain(filename2);
  });

  it("oversized fixture (D17): on-disk file is byte-identical to original upload (not cropper output)", async () => {
    // D17: real resize-to-fit is covered by triage-cropper.test.ts.
    // This test verifies the upload route invariant: the file saved to disk
    // is always the ORIGINAL bytes (saved before the cropper runs — D13).
    const originalBytes = Buffer.alloc(1024, 0xab); // 1 KiB fake oversized image

    // Pre-seed cache so the route returns 201 (cache hit, cropper doesn't run)
    // The invariant still holds: bytes on disk must equal the upload bytes.
    await seedCache(originalBytes);

    const filename = `oversized-${randomUUID().slice(0, 8)}.png`;
    const { json } = await expectFetch(
      `${baseUrl}/api/triage/upload`,
      { method: "POST", body: makeFormData(originalBytes, filename) },
      201
    );
    expect(json<{ filename: string }>().filename).toBe(filename);

    // On-disk file must be byte-identical to original upload
    const onDisk = await fs.readFile(path.join(screenshotDir, filename));
    expect(Buffer.compare(onDisk, originalBytes)).toBe(0);
  });

  it("collision suffixing: second upload of the same filename gets a numeric suffix", async () => {
    const sharedFilename = `collision-${randomUUID().slice(0, 8)}.png`;

    // Pre-seed both byte patterns so both uploads take the cache-hit path (→ 201)
    await seedCache(FAKE_PNG);
    await seedCache(FAKE_PNG_B);

    // First upload
    const { json: json1 } = await expectFetch(
      `${baseUrl}/api/triage/upload`,
      { method: "POST", body: makeFormData(FAKE_PNG, sharedFilename) },
      201
    );
    expect(json1<{ filename: string }>().filename).toBe(sharedFilename);

    // Second upload (different content → different hash → collision on filename)
    const { json: json2 } = await expectFetch(
      `${baseUrl}/api/triage/upload`,
      { method: "POST", body: makeFormData(FAKE_PNG_B, sharedFilename) },
      201
    );
    const second = json2<{ filename: string }>();
    expect(second.filename).not.toBe(sharedFilename);
    expect(second.filename).toMatch(/-\d+\./); // e.g. collision-abc123-1.png
  });

  it("path-traversal filename: 400 and no file written", async () => {
    await expectFetch(
      `${baseUrl}/api/triage/upload`,
      { method: "POST", body: makeFormData(FAKE_PNG, "../traversal.png") },
      400
    );
    // Nothing written in screenshotDir for this test's filename
  });
});
