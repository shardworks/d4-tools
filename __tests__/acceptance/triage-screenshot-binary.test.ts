/**
 * Acceptance tests for GET /api/triage/screenshots/[name] (S6).
 *
 * Covers:
 *  - Returns binary bytes with correct Content-Type and Cache-Control headers
 *  - Returns 404 for a missing file
 *  - Path-traversal URL encoding (D15): encodeURIComponent('../probe.png')
 *    produces a URL whose segment contains '..' — handler returns 404 because
 *    the GET handler validates via directory-listing membership (not an
 *    explicit '..' check); the file is simply not found.
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
  nextDecodesEncodedSlash,
  expectFetch,
  FAKE_PNG,
} from "./harness";

setupAcceptance();

describe("GET /api/triage/screenshots/[name]", () => {
  it("returns binary bytes with correct Content-Type for a PNG file", async () => {
    const filename = `binary-${randomUUID().slice(0, 8)}.png`;
    await fs.writeFile(path.join(screenshotDir, filename), FAKE_PNG);

    const { res, bodyText } = await expectFetch(
      `${baseUrl}/api/triage/screenshots/${filename}`,
      {},
      200
    );
    expect(res.headers.get("Content-Type")).toBe("image/png");
    // The response body should be non-empty
    expect(bodyText.length).toBeGreaterThan(0);
  });

  it("sets Cache-Control header on successful response", async () => {
    const filename = `cache-${randomUUID().slice(0, 8)}.png`;
    await fs.writeFile(path.join(screenshotDir, filename), FAKE_PNG);

    const { res } = await expectFetch(
      `${baseUrl}/api/triage/screenshots/${filename}`,
      {},
      200
    );
    // The route sets a 1-hour cache for screenshot binaries
    expect(res.headers.get("Cache-Control")).toBeTruthy();
  });

  it("returns 404 for a file that does not exist", async () => {
    await expectFetch(
      `${baseUrl}/api/triage/screenshots/missing-${randomUUID().slice(0, 8)}.png`,
      {},
      404
    );
  });

  it("path-traversal URL: encodeURIComponent('../probe.png') returns 404 (D15)", async () => {
    // encodeURIComponent('../probe.png') = '..%2Fprobe.png'
    // The GET handler validates via dir-listing membership; '../probe.png' (or
    // '..%2Fprobe.png') is not in the listing → 404.
    // nextDecodesEncodedSlash records which form Next.js passes to params.name,
    // but the assertion is 404 regardless (documented by the probe result).
    const encodedTraversal = encodeURIComponent("../probe.png");
    void nextDecodesEncodedSlash; // consumed for documentation; no branch needed
    await expectFetch(
      `${baseUrl}/api/triage/screenshots/${encodedTraversal}`,
      {},
      404
    );
  });
});
