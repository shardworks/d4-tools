/**
 * Tests for POST /api/triage/upload
 *
 * Covers the required acceptance cases:
 * - Happy path: 201, file written under SCREENSHOT_DIR, cache entry written,
 *   full CacheEntry returned in the response body.
 * - Auth gating: 401 when UPLOAD_SECRET is set and X-Upload-Token is missing
 *   or wrong; 201 with the correct header.
 * - LLM-error contract: mocked extractor throws → 200, parseStatus: "error",
 *   file still on disk, no cache file written.
 * - Collision suffixing: uploading the same filename twice yields a -1-suffixed
 *   second file.
 * - Path-traversal rejection: filename: "../foo.png" → 400, no file written.
 *
 * Uses dynamic imports after env-var setup (same pattern as triage-cache.test.ts)
 * and vi.mock to control the LLM extractor.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { sha256 } from "../lib/triage/hash";
import type { CacheEntry } from "../lib/triage/types";

// ─── Hoist mock before any imports ──────────────────────────────────────────
vi.mock("@/lib/triage/anthropic");

// ─── Minimal fake PNG bytes (content doesn't need to be valid) ───────────────
// The route validates MIME from the Blob.type field, not byte sniffing.
const FAKE_PNG_A = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]); // 6 bytes
const FAKE_PNG_B = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x02]); // different content

// ─── Test suite ──────────────────────────────────────────────────────────────
describe("POST /api/triage/upload", () => {
  let tmpDir: string;
  let screenshotDir: string;
  const origDataDir = process.env.DATA_DIR;
  const origScreenshotDir = process.env.SCREENSHOT_DIR;
  const origUploadSecret = process.env.UPLOAD_SECRET;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "d4-upload-test-"));
    screenshotDir = path.join(tmpDir, "screenshots");
    await fs.mkdir(screenshotDir, { recursive: true });
    process.env.DATA_DIR = tmpDir;
    process.env.SCREENSHOT_DIR = screenshotDir;
    // Tests that need a secret set it themselves; default is no secret
    delete process.env.UPLOAD_SECRET;
  });

  afterEach(async () => {
    process.env.DATA_DIR = origDataDir;
    process.env.SCREENSHOT_DIR = origScreenshotDir;
    if (origUploadSecret !== undefined) {
      process.env.UPLOAD_SECRET = origUploadSecret;
    } else {
      delete process.env.UPLOAD_SECRET;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /** Build a multipart Request with an image Blob and optional extra fields/headers. */
  function makeRequest(
    imageBytes: Buffer,
    filename: string | null,
    headers?: Record<string, string>
  ): Request {
    const formData = new FormData();
    // Convert Buffer → Uint8Array for Blob — avoids the SharedArrayBuffer typing ambiguity
    formData.append("file", new Blob([new Uint8Array(imageBytes)], { type: "image/png" }), "upload.png");
    if (filename !== null) {
      formData.append("filename", filename);
    }
    return new Request("http://localhost/api/triage/upload", {
      method: "POST",
      body: formData,
      headers,
    });
  }

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("happy path: 201, file written under SCREENSHOT_DIR, cache entry created, CacheEntry returned", async () => {
    const mockEntry: CacheEntry = {
      kind: "item",
      items: [
        {
          name: "Harlequin Crest",
          itemType: "Helm",
          rarity: "unique",
          isAncestral: false,
          implicits: [],
          explicits: [{ label: "Maximum Life", rolledValue: 2800 }],
          tempered: [],
        },
      ],
      model: "claude-sonnet-4-5-20250929",
      timestamp: new Date().toISOString(),
    };

    const { extractItemsFromImage } = await import("@/lib/triage/anthropic");
    (extractItemsFromImage as ReturnType<typeof vi.fn>).mockResolvedValue(mockEntry);

    const { POST } = await import("../app/api/triage/upload/route");

    const res = await POST(makeRequest(FAKE_PNG_A, "harlequin.png"));

    expect(res.status).toBe(201);
    const body = await res.json();

    // Response shape
    expect(body.filename).toBe("harlequin.png");
    expect(body.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.parseStatus).toBe("item");
    expect(body.parsed).toBeDefined();
    expect(body.parsed.kind).toBe("item");
    expect(body.parsed.items[0].name).toBe("Harlequin Crest");

    // File saved under SCREENSHOT_DIR
    const savedPath = path.join(screenshotDir, "harlequin.png");
    expect(
      await fs
        .stat(savedPath)
        .then(() => true)
        .catch(() => false)
    ).toBe(true);

    // Cache entry written under DATA_DIR/screenshot-cache/<hash>.json
    const expectedHash = sha256(FAKE_PNG_A);
    expect(body.hash).toBe(expectedHash);
    const cachePath = path.join(tmpDir, "screenshot-cache", `${expectedHash}.json`);
    expect(
      await fs
        .stat(cachePath)
        .then(() => true)
        .catch(() => false)
    ).toBe(true);

    // Cache entry content matches the mocked result
    const cacheRaw = await fs.readFile(cachePath, "utf-8");
    const cacheJson = JSON.parse(cacheRaw);
    expect(cacheJson.kind).toBe("item");
    expect(cacheJson.items[0].name).toBe("Harlequin Crest");
  });

  // ── Auth gating ───────────────────────────────────────────────────────────

  it("auth gating: 401 when UPLOAD_SECRET is set and X-Upload-Token header is absent", async () => {
    process.env.UPLOAD_SECRET = "super-secret-token-abc";
    const { POST } = await import("../app/api/triage/upload/route");

    const res = await POST(makeRequest(FAKE_PNG_A, "shot.png"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();

    // No file written
    expect(await fs.readdir(screenshotDir)).toHaveLength(0);
  });

  it("auth gating: 401 when UPLOAD_SECRET is set and X-Upload-Token is wrong", async () => {
    process.env.UPLOAD_SECRET = "super-secret-token-abc";
    const { POST } = await import("../app/api/triage/upload/route");

    const res = await POST(
      makeRequest(FAKE_PNG_A, "shot.png", { "X-Upload-Token": "wrong-token" })
    );
    expect(res.status).toBe(401);
  });

  it("auth gating: 201 when UPLOAD_SECRET is set and X-Upload-Token matches", async () => {
    process.env.UPLOAD_SECRET = "super-secret-token-abc";

    const { extractItemsFromImage } = await import("@/lib/triage/anthropic");
    (extractItemsFromImage as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: "no-item-detected",
      model: "test",
      timestamp: new Date().toISOString(),
    } satisfies CacheEntry);

    const { POST } = await import("../app/api/triage/upload/route");

    const res = await POST(
      makeRequest(FAKE_PNG_A, "shot.png", { "X-Upload-Token": "super-secret-token-abc" })
    );
    expect(res.status).toBe(201);
  });

  // ── LLM-error contract ────────────────────────────────────────────────────

  it("LLM-error contract: 200, parseStatus 'error', file still on disk, no cache file written", async () => {
    const { extractItemsFromImage } = await import("@/lib/triage/anthropic");
    (extractItemsFromImage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Anthropic API error 503: Service temporarily unavailable")
    );

    const { POST } = await import("../app/api/triage/upload/route");

    const res = await POST(makeRequest(FAKE_PNG_A, "shot.png"));

    // 200, not 201 — file accepted but parse failed
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.parseStatus).toBe("error");
    expect(body.error).toContain("503");
    expect(body.filename).toBe("shot.png");
    expect(body.hash).toMatch(/^[a-f0-9]{64}$/);

    // File still saved on disk
    expect(
      await fs
        .stat(path.join(screenshotDir, "shot.png"))
        .then(() => true)
        .catch(() => false)
    ).toBe(true);

    // No cache file written on LLM failure
    const expectedHash = sha256(FAKE_PNG_A);
    const cachePath = path.join(tmpDir, "screenshot-cache", `${expectedHash}.json`);
    expect(
      await fs
        .stat(cachePath)
        .then(() => true)
        .catch(() => false)
    ).toBe(false);
  });

  // ── Collision suffixing ───────────────────────────────────────────────────

  it("collision suffixing: second upload of the same filename gets -1 suffix", async () => {
    const { extractItemsFromImage } = await import("@/lib/triage/anthropic");
    (extractItemsFromImage as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: "no-item-detected",
      model: "test",
      timestamp: new Date().toISOString(),
    } satisfies CacheEntry);

    const { POST } = await import("../app/api/triage/upload/route");

    // First upload: "shot.png" → saved as "shot.png"
    const res1 = await POST(makeRequest(FAKE_PNG_A, "shot.png"));
    expect(res1.status).toBe(201);
    const body1 = await res1.json();
    expect(body1.filename).toBe("shot.png");

    // Second upload: same filename but DIFFERENT content (different hash)
    // → collision → saved as "shot-1.png"
    const res2 = await POST(makeRequest(FAKE_PNG_B, "shot.png"));
    expect(res2.status).toBe(201);
    const body2 = await res2.json();
    expect(body2.filename).toBe("shot-1.png");

    // Both files exist
    expect(
      await fs
        .stat(path.join(screenshotDir, "shot.png"))
        .then(() => true)
        .catch(() => false)
    ).toBe(true);
    expect(
      await fs
        .stat(path.join(screenshotDir, "shot-1.png"))
        .then(() => true)
        .catch(() => false)
    ).toBe(true);
  });

  // ── Path-traversal rejection ───────────────────────────────────────────────

  it("path-traversal rejection: filename '../foo.png' returns 400 and writes no file", async () => {
    const { POST } = await import("../app/api/triage/upload/route");

    const res = await POST(makeRequest(FAKE_PNG_A, "../foo.png"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid path/i);

    // Nothing written anywhere
    expect(await fs.readdir(screenshotDir)).toHaveLength(0);
  });

  it("path-traversal rejection: filename with forward slash returns 400", async () => {
    const { POST } = await import("../app/api/triage/upload/route");

    const res = await POST(makeRequest(FAKE_PNG_A, "subdir/foo.png"));
    expect(res.status).toBe(400);
  });

  // ── Cache hit: file saved first, then result read from cache ──────────────

  it("cache hit: file is saved even when cache already has an entry for the same hash", async () => {
    const { extractItemsFromImage } = await import("@/lib/triage/anthropic");
    const mockEntry: CacheEntry = {
      kind: "item",
      items: [
        {
          name: "Cached Item",
          itemType: "Ring",
          rarity: "legendary",
          isAncestral: false,
          implicits: [],
          explicits: [],
          tempered: [],
        },
      ],
      model: "test",
      timestamp: new Date().toISOString(),
    };
    (extractItemsFromImage as ReturnType<typeof vi.fn>).mockResolvedValue(mockEntry);

    // Prime the cache via a first upload (different filename, same bytes)
    const { POST } = await import("../app/api/triage/upload/route");
    await POST(makeRequest(FAKE_PNG_A, "first.png"));

    // Second upload: same bytes (same hash) — cache should be hit; file still saved
    const res = await POST(makeRequest(FAKE_PNG_A, "second.png"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.parseStatus).toBe("item");

    // Both files exist (always-save semantics, D13)
    expect(
      await fs
        .stat(path.join(screenshotDir, "first.png"))
        .then(() => true)
        .catch(() => false)
    ).toBe(true);
    expect(
      await fs
        .stat(path.join(screenshotDir, "second.png"))
        .then(() => true)
        .catch(() => false)
    ).toBe(true);

    // LLM called only once (second call was a cache hit)
    expect(extractItemsFromImage as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });
});
