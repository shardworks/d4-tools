/**
 * Acceptance tests for DELETE /api/triage/screenshots/[name] (S11).
 *
 * Covers:
 *  - 204 when screenshot file exists (file deleted)
 *  - 204 when file + cache entry both exist (both deleted)
 *  - 404 for cache-only-orphan case (D11): file missing → can't compute hash
 *    → can't delete cache → neither resource deleted → 404
 *  - 400 for path-traversal filename (D15): encodeURIComponent('../foo.png')
 *    produces a segment containing '..' → DELETE handler's explicit '..' check
 *    triggers regardless of URL encoding
 *  - 404 for a file that does not exist at all
 *
 * No vi.mock() needed — this route only reads/writes the filesystem.
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
  FAKE_PNG,
} from "./harness";
// sha256 is needed to compute the cache path for the cache-entry test
import { sha256 } from "../../lib/triage/hash";

setupAcceptance();

describe("DELETE /api/triage/screenshots/[name]", () => {
  it("returns 204 and removes the screenshot file", async () => {
    const filename = `del-${randomUUID().slice(0, 8)}.png`;
    const filePath = path.join(screenshotDir, filename);
    await fs.writeFile(filePath, FAKE_PNG);

    await expectFetch(
      `${baseUrl}/api/triage/screenshots/${filename}`,
      { method: "DELETE" },
      204
    );

    // File should be gone
    const exists = await fs
      .stat(filePath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("returns 204 and removes both the file and its cache entry", async () => {
    const filename = `del-cache-${randomUUID().slice(0, 8)}.png`;
    const filePath = path.join(screenshotDir, filename);
    await fs.writeFile(filePath, FAKE_PNG);

    // Write a matching cache entry
    const hash = sha256(FAKE_PNG);
    const cacheDir = path.join(tmpDir, "screenshot-cache");
    await fs.mkdir(cacheDir, { recursive: true });
    const cachePath = path.join(cacheDir, `${hash}.json`);
    await fs.writeFile(
      cachePath,
      JSON.stringify({
        kind: "no-item-detected",
        model: "test",
        timestamp: new Date().toISOString(),
      })
    );

    await expectFetch(
      `${baseUrl}/api/triage/screenshots/${filename}`,
      { method: "DELETE" },
      204
    );

    // Both file and cache entry should be gone
    expect(
      await fs
        .stat(filePath)
        .then(() => true)
        .catch(() => false)
    ).toBe(false);
    expect(
      await fs
        .stat(cachePath)
        .then(() => true)
        .catch(() => false)
    ).toBe(false);
  });

  it("cache-only-orphan: returns 404 when the file is missing (D11)", async () => {
    // The DELETE handler must read the file to compute its hash before it can
    // delete the cache entry. If the file doesn't exist, it can't compute the
    // hash, so the cache entry is not deleted — and since neither resource was
    // actually deleted, the route returns 404.
    // This is the current implementation contract; a cache-only orphan cannot
    // be cleaned up via DELETE. A separate commission (obs-1) tracks this.
    const missingFilename = `ghost-${randomUUID().slice(0, 8)}.png`;
    await expectFetch(
      `${baseUrl}/api/triage/screenshots/${missingFilename}`,
      { method: "DELETE" },
      404
    );
  });

  it("returns 404 when a non-existent file is deleted with no cache entry", async () => {
    await expectFetch(
      `${baseUrl}/api/triage/screenshots/no-file-${randomUUID().slice(0, 8)}.png`,
      { method: "DELETE" },
      404
    );
  });

  it("path-traversal: encodeURIComponent('../foo.png') returns 400 (D15)", async () => {
    // encodeURIComponent('../foo.png') = '..%2Ffoo.png'
    // The DELETE handler explicitly checks name.includes("..") — this is true
    // for '..%2Ffoo.png' because the '..' characters are not percent-encoded.
    // So the handler returns 400 regardless of whether Next.js decodes '%2F'.
    const encodedTraversal = encodeURIComponent("../foo.png");
    const { json } = await expectFetch(
      `${baseUrl}/api/triage/screenshots/${encodedTraversal}`,
      { method: "DELETE" },
      400
    );
    const body = json<{ error: string }>();
    expect(body.error).toMatch(/invalid path/i);
  });
});
