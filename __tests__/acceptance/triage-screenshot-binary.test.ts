/**
 * Acceptance tests for GET /api/triage/screenshots/[name] (S6).
 *
 * Covers:
 *  - Returns binary bytes with correct Content-Type and Cache-Control headers
 *  - Returns 404 for a missing file
 *  - Path-traversal URL encoding: encodeURIComponent('../probe.png')
 *    produces a URL whose segment contains '..' — handler returns 400 because
 *    the GET handler explicitly checks name.includes("..") before the dir-listing.
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

  it("path-traversal URL: encodeURIComponent('../probe.png') returns 400", async () => {
    // The GET handler explicitly checks name.includes("..") — this is true for
    // '..%2Fprobe.png' because '..' is not percent-encoded. Handler returns 400.
    const encodedTraversal = encodeURIComponent("../probe.png");
    await expectFetch(
      `${baseUrl}/api/triage/screenshots/${encodedTraversal}`,
      {},
      400
    );
  });
});
