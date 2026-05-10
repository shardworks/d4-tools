/**
 * Acceptance tests for:
 *  - GET /api/triage/cropped/[hash]?filename=...            (S9 — metadata)
 *  - GET /api/triage/cropped/[hash]/[index]?filename=...    (S9 — binary)
 *
 * vi.mock('@/lib/triage/crop') is NOT used for route handler interception.
 * Next.js compiles route handlers through its own module evaluation system
 * (independent of Node.js require()), so Vitest's module registry patch does
 * not reach the route handler's imports. The real cropForVision runs on
 * every request.
 *
 * Real cropForVision behaviour on FAKE_PNG (8-byte minimal PNG header):
 *   detected=false, images.length=1, mediaType="image/png", resized=false
 *
 * Covers:
 *  - Metadata endpoint returns { count, detected } for a valid file (D10)
 *  - Binary endpoint returns image bytes with Content-Type + Cache-Control
 *  - Both return 400 when ?filename= is absent (D10)
 *  - Both return 404 when hash does not match file content
 *  - Binary endpoint returns 404 for an out-of-bounds index
 *  - 400 for path-traversal filename in ?filename= query param
 *  - Binary endpoint does NOT write crop output to disk (transient-only)
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import {
  setupAcceptance,
  baseUrl,
  screenshotDir,
  expectFetch,
  FAKE_PNG,
} from "./harness";
import { sha256 } from "../../lib/triage/hash";

setupAcceptance();

/** Write a file and return { hash, filename }. */
async function seedFile(
  bytes: Buffer = FAKE_PNG
): Promise<{ hash: string; filename: string }> {
  const filename = `cropped-${randomUUID().slice(0, 8)}.png`;
  await fs.writeFile(path.join(screenshotDir, filename), bytes);
  return { hash: sha256(bytes), filename };
}

describe("GET /api/triage/cropped/[hash] (metadata endpoint)", () => {
  it("returns { count, detected } for a valid file (D10)", async () => {
    const { hash, filename } = await seedFile();

    const { json } = await expectFetch(
      `${baseUrl}/api/triage/cropped/${hash}?filename=${encodeURIComponent(filename)}`,
      {},
      200
    );
    const body = json<{ count: number; detected: boolean }>();
    // Real cropForVision on FAKE_PNG: 1 region, detected=false (no tooltip in fake PNG)
    expect(body.count).toBe(1);
    expect(body.detected).toBe(false);
  });

  it("returns detected=false when the cropper finds no tooltip", async () => {
    const { hash, filename } = await seedFile();

    const { json } = await expectFetch(
      `${baseUrl}/api/triage/cropped/${hash}?filename=${encodeURIComponent(filename)}`,
      {},
      200
    );
    const body = json<{ count: number; detected: boolean }>();
    expect(body.detected).toBe(false);
  });

  // NOTE: Testing count > 1 requires a real game screenshot containing multiple
  // tooltips. This cannot be reliably exercised with a synthetic fake PNG because
  // the real cropForVision always returns count=1 for non-game images.
  it.todo("returns count=2 for a multi-crop result (requires real multi-tooltip screenshot)");

  it("returns 400 when ?filename= is absent (D10)", async () => {
    const { hash } = await seedFile();
    await expectFetch(`${baseUrl}/api/triage/cropped/${hash}`, {}, 400);
  });

  it("returns 404 when hash does not match file content", async () => {
    const { filename } = await seedFile();
    const wrongHash = "a".repeat(64);
    await expectFetch(
      `${baseUrl}/api/triage/cropped/${wrongHash}?filename=${encodeURIComponent(filename)}`,
      {},
      404
    );
  });

  it("returns 400 for a path-traversal ?filename value", async () => {
    const { hash } = await seedFile();
    await expectFetch(
      `${baseUrl}/api/triage/cropped/${hash}?filename=../etc/passwd`,
      {},
      400
    );
  });

  it("returns 400 for a bad-format hash (too short / non-hex)", async () => {
    const { filename } = await seedFile();
    // 'abc123' is 6 chars — not 64 hex — should be rejected
    await expectFetch(
      `${baseUrl}/api/triage/cropped/abc123?filename=${encodeURIComponent(filename)}`,
      {},
      400
    );
  });

  it("returns 404 when source screenshot is missing (not hash mismatch)", async () => {
    // Use a valid 64-char hex hash but no corresponding file
    const missingHash = "c".repeat(64);
    const missingFilename = `missing-${randomUUID().slice(0, 8)}.png`;
    await expectFetch(
      `${baseUrl}/api/triage/cropped/${missingHash}?filename=${encodeURIComponent(missingFilename)}`,
      {},
      404
    );
  });
});

describe("GET /api/triage/cropped/[hash]/[index] (binary endpoint)", () => {
  it("returns image bytes with correct Content-Type and Cache-Control headers (D10)", async () => {
    // Real cropForVision on FAKE_PNG returns the bytes with mediaType "image/png"
    // (derived from the .png file extension — the route maps ext → mediaType).
    const { hash, filename } = await seedFile();

    const { res } = await expectFetch(
      `${baseUrl}/api/triage/cropped/${hash}/0?filename=${encodeURIComponent(filename)}`,
      {},
      200
    );
    // Content-Type is set from the crop result's mediaType field
    expect(res.headers.get("Content-Type")).toBe("image/png");
    // Cache-Control is always immutable for content-hash-addressed crop images
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable"
    );
  });

  it("returns 400 when ?filename= is absent (D10)", async () => {
    const { hash } = await seedFile();
    await expectFetch(
      `${baseUrl}/api/triage/cropped/${hash}/0`,
      {},
      400
    );
  });

  it("returns 404 for an out-of-bounds index", async () => {
    const { hash, filename } = await seedFile();
    // Real cropForVision on FAKE_PNG returns 1 image; index 5 is out of bounds
    await expectFetch(
      `${baseUrl}/api/triage/cropped/${hash}/5?filename=${encodeURIComponent(filename)}`,
      {},
      404
    );
  });

  it("returns 404 when hash does not match file content", async () => {
    const { filename } = await seedFile();
    const wrongHash = "b".repeat(64);
    await expectFetch(
      `${baseUrl}/api/triage/cropped/${wrongHash}/0?filename=${encodeURIComponent(filename)}`,
      {},
      404
    );
  });

  it("returns 400 for a path-traversal ?filename value", async () => {
    const { hash } = await seedFile();
    await expectFetch(
      `${baseUrl}/api/triage/cropped/${hash}/0?filename=../etc/passwd`,
      {},
      400
    );
  });

  it("returns 400 for a bad-format hash (non-hex / too short)", async () => {
    const { filename } = await seedFile();
    await expectFetch(
      `${baseUrl}/api/triage/cropped/not-a-valid-hash/0?filename=${encodeURIComponent(filename)}`,
      {},
      400
    );
  });

  it("returns 404 when source screenshot is missing", async () => {
    const missingHash = "d".repeat(64);
    const missingFilename = `missing-bin-${randomUUID().slice(0, 8)}.png`;
    await expectFetch(
      `${baseUrl}/api/triage/cropped/${missingHash}/0?filename=${encodeURIComponent(missingFilename)}`,
      {},
      404
    );
  });

  it("does NOT write crop output to disk (transient-only, crop is memory-only)", async () => {
    const { hash, filename } = await seedFile();

    // Snapshot the directory before the request
    const filesBefore = await fs.readdir(screenshotDir);

    await expectFetch(
      `${baseUrl}/api/triage/cropped/${hash}/0?filename=${encodeURIComponent(filename)}`,
      {},
      200
    );

    // No new files should appear — crop output is memory-only, never persisted
    const filesAfter = await fs.readdir(screenshotDir);
    expect(filesAfter.length).toBe(filesBefore.length);
    // The seeded screenshot is still present
    expect(filesAfter).toContain(filename);
  });
});
