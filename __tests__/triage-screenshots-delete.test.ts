/**
 * Tests for DELETE /api/triage/screenshots/[name]
 *
 * Covers:
 * - Happy path: file + cache both exist → 204, both unlinked
 * - Partial state (file only, no cache): 204, file unlinked
 * - Partial state (neither): 404
 * - Partial state (cache-only): 404 (can't compute hash without file)
 * - Path-traversal rejection: 400 for .., /, \
 * - Re-delete: returns 404 (both already gone)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { sha256 } from "../lib/triage/hash";
import { getCachedHash, pruneNotIn } from "../lib/triage/hash-cache";

const FAKE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);

describe("DELETE /api/triage/screenshots/[name]", () => {
  let tmpDir: string;
  let screenshotDir: string;
  const origDataDir = process.env.DATA_DIR;
  const origScreenshotDir = process.env.SCREENSHOT_DIR;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "d4-delete-test-"));
    screenshotDir = path.join(tmpDir, "screenshots");
    await fs.mkdir(screenshotDir, { recursive: true });
    process.env.DATA_DIR = tmpDir;
    process.env.SCREENSHOT_DIR = screenshotDir;
    // Clear the module-scoped hash cache so tests do not share state.
    pruneNotIn(new Set());
  });

  afterEach(async () => {
    process.env.DATA_DIR = origDataDir;
    process.env.SCREENSHOT_DIR = origScreenshotDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeRequest(name: string): Request {
    return new Request(`http://localhost/api/triage/screenshots/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
  }

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("happy path: file + cache both exist → 204, both deleted", async () => {
    // Write screenshot file
    const screenshotPath = path.join(screenshotDir, "shot.png");
    await fs.writeFile(screenshotPath, FAKE_PNG);

    // Write cache file
    const hash = sha256(FAKE_PNG);
    const cacheDir = path.join(tmpDir, "screenshot-cache");
    await fs.mkdir(cacheDir, { recursive: true });
    const cachePath = path.join(cacheDir, `${hash}.json`);
    await fs.writeFile(cachePath, JSON.stringify({ kind: "no-item-detected" }));

    const { DELETE } = await import("../app/api/triage/screenshots/[name]/route");
    const res = await DELETE(makeRequest("shot.png"), {
      params: Promise.resolve({ name: "shot.png" }),
    });

    expect(res.status).toBe(204);

    // Both files should be gone
    expect(
      await fs.stat(screenshotPath).then(() => true).catch(() => false)
    ).toBe(false);
    expect(
      await fs.stat(cachePath).then(() => true).catch(() => false)
    ).toBe(false);
  });

  // ── Partial state: file only, no cache ─────────────────────────────────────

  it("file only (no cache): 204, file deleted", async () => {
    const screenshotPath = path.join(screenshotDir, "no-cache.png");
    await fs.writeFile(screenshotPath, FAKE_PNG);

    const { DELETE } = await import("../app/api/triage/screenshots/[name]/route");
    const res = await DELETE(makeRequest("no-cache.png"), {
      params: Promise.resolve({ name: "no-cache.png" }),
    });

    expect(res.status).toBe(204);

    expect(
      await fs.stat(screenshotPath).then(() => true).catch(() => false)
    ).toBe(false);
  });

  // ── Partial state: neither ─────────────────────────────────────────────────

  it("neither file nor cache: 404", async () => {
    const { DELETE } = await import("../app/api/triage/screenshots/[name]/route");
    const res = await DELETE(makeRequest("ghost.png"), {
      params: Promise.resolve({ name: "ghost.png" }),
    });

    expect(res.status).toBe(404);
  });

  // ── Partial state: cache-only (no file) ────────────────────────────────────

  it("cache-only (file gone, cache orphan): 404 — cannot compute hash without file", async () => {
    // Write only the cache file (orphan)
    const hash = sha256(FAKE_PNG);
    const cacheDir = path.join(tmpDir, "screenshot-cache");
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(
      path.join(cacheDir, `${hash}.json`),
      JSON.stringify({ kind: "no-item-detected" })
    );
    // Do NOT write the screenshot file

    const { DELETE } = await import("../app/api/triage/screenshots/[name]/route");
    const res = await DELETE(makeRequest("orphan.png"), {
      params: Promise.resolve({ name: "orphan.png" }),
    });

    // Can't compute hash without file → neither deleted → 404
    expect(res.status).toBe(404);
  });

  // ── Re-delete ──────────────────────────────────────────────────────────────

  it("re-delete (both already gone): 404, no crash", async () => {
    const screenshotPath = path.join(screenshotDir, "gone.png");
    await fs.writeFile(screenshotPath, FAKE_PNG);

    const hash = sha256(FAKE_PNG);
    const cacheDir = path.join(tmpDir, "screenshot-cache");
    await fs.mkdir(cacheDir, { recursive: true });
    const cachePath = path.join(cacheDir, `${hash}.json`);
    await fs.writeFile(cachePath, JSON.stringify({ kind: "no-item-detected" }));

    const { DELETE } = await import("../app/api/triage/screenshots/[name]/route");

    // First delete — should succeed
    const res1 = await DELETE(makeRequest("gone.png"), {
      params: Promise.resolve({ name: "gone.png" }),
    });
    expect(res1.status).toBe(204);

    // Second delete — both already gone → 404
    const res2 = await DELETE(makeRequest("gone.png"), {
      params: Promise.resolve({ name: "gone.png" }),
    });
    expect(res2.status).toBe(404);
  });

  // ── Path-traversal rejection ───────────────────────────────────────────────

  it("path-traversal with ..: 400", async () => {
    const { DELETE } = await import("../app/api/triage/screenshots/[name]/route");
    const res = await DELETE(makeRequest("../etc/passwd"), {
      params: Promise.resolve({ name: "../etc/passwd" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid path/i);
  });

  it("path-traversal with /: 400", async () => {
    const { DELETE } = await import("../app/api/triage/screenshots/[name]/route");
    const res = await DELETE(makeRequest("sub/file.png"), {
      params: Promise.resolve({ name: "sub/file.png" }),
    });
    expect(res.status).toBe(400);
  });

  it("path-traversal with backslash: 400", async () => {
    const { DELETE } = await import("../app/api/triage/screenshots/[name]/route");
    const res = await DELETE(makeRequest("foo\\bar.png"), {
      params: Promise.resolve({ name: "foo\\bar.png" }),
    });
    expect(res.status).toBe(400);
  });

  // ── Cache-hit path: DELETE resolves hash via cache, not via file bytes ───

  it("cache-hit: DELETE uses cached hash, not readFile, to resolve the parse-cache entry", async () => {
    // Write the screenshot file so stat + unlink succeed normally.
    const screenshotPath = path.join(screenshotDir, "cached.png");
    await fs.writeFile(screenshotPath, FAKE_PNG);

    // Stat the file so we have the exact (mtimeMs, size) tuple.
    const stat = await fs.stat(screenshotPath);
    const realHash = sha256(FAKE_PNG);

    // Write the real parse-cache entry (keyed by realHash).
    const cacheDir = path.join(tmpDir, "screenshot-cache");
    await fs.mkdir(cacheDir, { recursive: true });
    const realCachePath = path.join(cacheDir, `${realHash}.json`);
    await fs.writeFile(realCachePath, JSON.stringify({ kind: "no-item-detected" }));

    // Seed the hash cache with a sentinel hash that differs from realHash.
    // When the DELETE handler calls getCachedHash it will find this entry and
    // return the sentinel without ever touching the file bytes.
    const sentinelHash = "a".repeat(64); // guaranteed ≠ sha256(FAKE_PNG)
    await getCachedHash("cached.png", stat.mtimeMs, stat.size, () => Promise.resolve(sentinelHash));

    const { DELETE } = await import("../app/api/triage/screenshots/[name]/route");
    const res = await DELETE(makeRequest("cached.png"), {
      params: Promise.resolve({ name: "cached.png" }),
    });

    // 204: the screenshot file was deleted (fileDeleted = true).
    expect(res.status).toBe(204);

    // The screenshot file should be gone.
    expect(await fs.stat(screenshotPath).then(() => true).catch(() => false)).toBe(false);

    // The REAL parse-cache file must still exist — the DELETE used the sentinel
    // hash from the cache, not the hash derived from file bytes, so it attempted
    // to unlink a non-existent sentinel entry and left the real one untouched.
    // This proves the cache-hit path was taken (no readFile → sha256 computation).
    expect(await fs.stat(realCachePath).then(() => true).catch(() => false)).toBe(true);
  });
});
