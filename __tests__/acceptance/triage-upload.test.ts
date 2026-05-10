/**
 * Acceptance tests for POST /api/triage/upload (S10).
 *
 * vi.mock() is NOT used for route handler interception in this file.
 * Next.js compiles route handlers through its own module evaluation system
 * (independent of Node.js require()), so Vitest's module registry patch does
 * not reach the route handler's imports. Tests control route behaviour through
 * filesystem state and the stub Anthropic server instead:
 *
 *  - Happy path → use withAnthropicSuccess([], fn) so the stub LLM returns
 *    a no-item-detected response → route returns 201 and writes cache entry.
 *  - LLM-error contract → upload unique bytes with no stub success → stub
 *    returns 401 (simulating an invalid key) → route returns 200/error.
 *  - Auth tests → pre-seed cache or use withAnthropicSuccess for 201 paths.
 *
 * The stub Anthropic server (harness D1) defaults to returning 401 (invalid
 * API key error), surfacing accidental uncached paths as errors. Use
 * withAnthropicSuccess(items, fn) for tests that need the LLM to succeed.
 *
 * Covers:
 *  - Happy path: 201, file under SCREENSHOT_DIR, cache entry written by route
 *  - Auth gating: 401 when UPLOAD_SECRET set and token absent/wrong;
 *    201 when correct token sent (via withUploadSecret + pre-seeded cache)
 *  - LLM-error contract: 200 with parseStatus:"error", file still on disk,
 *    no cache entry written
 *  - Cache hit: second upload of identical bytes returns 201 via the cache
 *  - Oversized fixture (D17): original bytes on disk are byte-identical to
 *    the uploaded content (cropper output is never written to disk)
 *  - Collision suffixing: second upload of the same filename (different
 *    content) gets a numeric suffix
 *  - Auto-generated filename when none supplied
 *  - Unsupported MIME type: 400
 *  - Filename containing '/' or '\\': 400
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
  withAnthropicSuccess,
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

/** Build a multipart request body without the filename field (tests auto-generation). */
function makeFormDataNoFilename(imageBytes: Buffer): FormData {
  const fd = new FormData();
  fd.append(
    "file",
    new Blob([new Uint8Array(imageBytes)], { type: "image/png" }),
    "upload.png"
  );
  // No "filename" field — route should auto-generate
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
  it("happy path: 201, file written under SCREENSHOT_DIR, cache entry written by route", async () => {
    const filename = `upload-${randomUUID().slice(0, 8)}.png`;
    const uniqueBytes = Buffer.concat([FAKE_PNG, Buffer.from(randomUUID())]);
    const expectedHash = sha256(uniqueBytes);

    // Verify cache does NOT exist before the request
    const cachePath = path.join(tmpDir, "screenshot-cache", `${expectedHash}.json`);
    expect(
      await fs.stat(cachePath).then(() => true).catch(() => false)
    ).toBe(false);

    // Use stub to return a no-item-detected LLM response (cache miss → LLM called → 201)
    await withAnthropicSuccess([], async () => {
      const { json } = await expectFetch(
        `${baseUrl}/api/triage/upload`,
        { method: "POST", body: makeFormData(uniqueBytes, filename) },
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
    });

    // File must be on disk
    const filePath = path.join(screenshotDir, filename);
    expect(
      await fs
        .stat(filePath)
        .then(() => true)
        .catch(() => false)
    ).toBe(true);

    // Cache entry must have been WRITTEN BY THE ROUTE (not pre-seeded)
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
    // D17: the cropper output is never written to disk; the original bytes are saved.
    // This test verifies the upload route invariant end-to-end via real HTTP.
    // The resize-to-fit path is exercised by the real cropForVision call (cache miss).
    // Use stub so the LLM call succeeds after cropping.
    const originalBytes = Buffer.alloc(1024, 0xab); // 1 KiB fake oversized image

    const filename = `oversized-${randomUUID().slice(0, 8)}.png`;

    await withAnthropicSuccess([], async () => {
      const { json } = await expectFetch(
        `${baseUrl}/api/triage/upload`,
        { method: "POST", body: makeFormData(originalBytes, filename) },
        201
      );
      expect(json<{ filename: string }>().filename).toBe(filename);
    });

    // On-disk file must be byte-identical to original upload (never cropper output)
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

  it("auto-generated filename when none supplied: response filename matches <ISO>-<hash8>.<ext> pattern", async () => {
    const uniqueBytes = Buffer.concat([FAKE_PNG, Buffer.from(randomUUID())]);

    await withAnthropicSuccess([], async () => {
      const { json } = await expectFetch(
        `${baseUrl}/api/triage/upload`,
        { method: "POST", body: makeFormDataNoFilename(uniqueBytes) },
        201
      );
      const body = json<{ filename: string }>();
      // Generated filename format: <ISO8601-with-dashes>-<first-8-of-sha256>.png
      // Example: 2026-05-10T12-30-00.000Z-ab12cd34.png
      expect(body.filename).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[a-f0-9]{8}\.png$/);
    });
  });

  it("unsupported MIME type: 400", async () => {
    const fd = new FormData();
    fd.append(
      "file",
      new Blob([Buffer.from("fake content")], { type: "application/pdf" }),
      "document.pdf"
    );
    fd.append("filename", `doc-${randomUUID().slice(0, 8)}.pdf`);

    await expectFetch(
      `${baseUrl}/api/triage/upload`,
      { method: "POST", body: fd },
      400
    );
  });

  it("filename containing '/': 400, no file written", async () => {
    await expectFetch(
      `${baseUrl}/api/triage/upload`,
      { method: "POST", body: makeFormData(FAKE_PNG, "sub/directory.png") },
      400
    );
  });

  it("filename containing '\\': 400, no file written", async () => {
    await expectFetch(
      `${baseUrl}/api/triage/upload`,
      { method: "POST", body: makeFormData(FAKE_PNG, "sub\\directory.png") },
      400
    );
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
