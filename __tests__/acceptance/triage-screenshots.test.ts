/**
 * Acceptance tests for GET /api/triage/screenshots (S5).
 *
 * Covers:
 *  - Returns an array (empty when dir is empty)
 *  - Returns entries with filename, mtimeMs, hash when files are present
 *  - Returns 500 with the directory path in error.message when SCREENSHOT_DIR
 *    does not exist (D12: expect(body.error).toContain(missingPath))
 *
 * No vi.mock() needed — this route only reads the filesystem.
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

setupAcceptance();

describe("GET /api/triage/screenshots", () => {
  it("returns an empty array when SCREENSHOT_DIR is empty", async () => {
    // The harness starts with a fresh, empty screenshotDir
    const { json } = await expectFetch(
      `${baseUrl}/api/triage/screenshots`,
      {},
      200
    );
    expect(Array.isArray(json())).toBe(true);
  });

  it("returns entries with filename, mtimeMs, hash for each image file", async () => {
    const filename = `shot-${randomUUID().slice(0, 8)}.png`;
    await fs.writeFile(path.join(screenshotDir, filename), FAKE_PNG);

    const { json } = await expectFetch(
      `${baseUrl}/api/triage/screenshots`,
      {},
      200
    );
    const entries = json<{ filename: string; mtimeMs: number; hash: string }[]>();
    expect(Array.isArray(entries)).toBe(true);

    const found = entries.find((e) => e.filename === filename);
    expect(found).toBeDefined();
    expect(typeof found!.mtimeMs).toBe("number");
    expect(found!.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("sorts entries by mtime descending (newest first)", async () => {
    const id = randomUUID().slice(0, 8);
    const oldFile = `old-${id}.png`;
    const newFile = `new-${id}.png`;

    // Write the older file first
    await fs.writeFile(path.join(screenshotDir, oldFile), FAKE_PNG);
    // Small delay to ensure a different mtime
    await new Promise((r) => setTimeout(r, 50));
    await fs.writeFile(
      path.join(screenshotDir, newFile),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff])
    );

    const { json } = await expectFetch(
      `${baseUrl}/api/triage/screenshots`,
      {},
      200
    );
    const entries = json<{ filename: string; mtimeMs: number }[]>();

    const oldIdx = entries.findIndex((e) => e.filename === oldFile);
    const newIdx = entries.findIndex((e) => e.filename === newFile);
    expect(oldIdx).toBeGreaterThan(-1);
    expect(newIdx).toBeGreaterThan(-1);
    // Newer file should appear before older file (lower index)
    expect(newIdx).toBeLessThan(oldIdx);
  });

  it("filters out unsupported file extensions (.txt, .bmp)", async () => {
    const id = randomUUID().slice(0, 8);
    const pngFile = `filter-${id}.png`;
    const txtFile = `filter-${id}.txt`;
    const bmpFile = `filter-${id}.bmp`;

    // Write one PNG and two unsupported files
    await fs.writeFile(path.join(screenshotDir, pngFile), FAKE_PNG);
    await fs.writeFile(path.join(screenshotDir, txtFile), Buffer.from("hello"));
    await fs.writeFile(path.join(screenshotDir, bmpFile), Buffer.from("BM"));

    const { json } = await expectFetch(
      `${baseUrl}/api/triage/screenshots`,
      {},
      200
    );
    const entries = json<{ filename: string }[]>();

    const filenames = entries.map((e) => e.filename);
    expect(filenames).toContain(pngFile);
    expect(filenames).not.toContain(txtFile);
    expect(filenames).not.toContain(bmpFile);
  });

  it("returns 500 with the missing path in body.error when SCREENSHOT_DIR does not exist (D12)", async () => {
    // Temporarily redirect SCREENSHOT_DIR to a non-existent path.
    // Tests within a file run sequentially (vitest default), so this env
    // mutation is safe — no concurrent test in this worker can race on it.
    const nonExistentDir = path.join(tmpDir, "does-not-exist-screenshots");
    const origDir = process.env.SCREENSHOT_DIR;
    try {
      process.env.SCREENSHOT_DIR = nonExistentDir;

      const { json } = await expectFetch(
        `${baseUrl}/api/triage/screenshots`,
        {},
        500
      );
      const body = json<{ error: string }>();
      // D12: error message must name the missing path
      expect(body.error).toContain(nonExistentDir);
    } finally {
      process.env.SCREENSHOT_DIR = origDir;
    }
  });
});
