/**
 * Acceptance tests for the Active-Build API (wire-level, via real HTTP).
 *
 * Covers:
 *  - GET /api/active-build   — read pointer (null when unset)
 *  - PUT /api/active-build   — set pointer
 *
 * SINGLETON CONSTRAINT (D14): The active-build endpoint manages a single
 * shared file (active-build.json) under DATA_DIR. All tests in this file
 * modify the same singleton. They MUST run sequentially, which is vitest's
 * default for tests within a single file. Never move these tests into a
 * parallel-safe describe block without re-designing the setup.
 *
 * A random prefix ensures the buildId values used in these tests do not
 * collide with ids written by other test files (D6), even though all files
 * in this worker share the same DATA_DIR.
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { setupAcceptance, baseUrl, expectFetch } from "./harness";

setupAcceptance();

// Stable prefix for this file's run — no beforeEach needed (tests share state)
const prefix = randomUUID().slice(0, 8);

describe("GET /api/active-build", () => {
  it("returns { buildId: null } when no active build has been set", async () => {
    const { json } = await expectFetch(`${baseUrl}/api/active-build`, {}, 200);
    const body = json<{ buildId: string | null }>();
    // Fresh DATA_DIR per worker (D5) — guaranteed null at start
    expect(body.buildId).toBeNull();
  });
});

describe("PUT /api/active-build", () => {
  it("sets the active build id and returns 200 with the new id", async () => {
    const buildId = `build-${prefix}-1`;
    const { json } = await expectFetch(
      `${baseUrl}/api/active-build`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildId }),
      },
      200
    );
    expect(json<{ buildId: string }>().buildId).toBe(buildId);
  });

  it("subsequent GET returns the previously set buildId", async () => {
    // This test relies on the PUT from the previous it() having run first.
    // Within a single file, vitest executes tests sequentially — safe (D14).
    const { json } = await expectFetch(`${baseUrl}/api/active-build`, {}, 200);
    const body = json<{ buildId: string | null }>();
    // After the PUT above, buildId should be non-null
    expect(body.buildId).toBe(`build-${prefix}-1`);
  });

  it("returns 400 for a body with missing buildId field", async () => {
    await expectFetch(
      `${baseUrl}/api/active-build`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notBuildId: "oops" }),
      },
      400
    );
  });

  it("returns 400 for a non-JSON body", async () => {
    await expectFetch(
      `${baseUrl}/api/active-build`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not json {{{",
      },
      400
    );
  });

  it("overwrites the active build when PUT is called again", async () => {
    const newBuildId = `build-${prefix}-2`;
    const { json: putJson } = await expectFetch(
      `${baseUrl}/api/active-build`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildId: newBuildId }),
      },
      200
    );
    expect(putJson<{ buildId: string }>().buildId).toBe(newBuildId);

    const { json: getJson } = await expectFetch(`${baseUrl}/api/active-build`, {}, 200);
    expect(getJson<{ buildId: string }>().buildId).toBe(newBuildId);
  });
});
