/**
 * Acceptance tests for the Characters API (wire-level, via real HTTP).
 *
 * Covers:
 *  - GET  /api/characters           — list
 *  - POST /api/characters           — create, slug generation, collision suffix
 *  - GET  /api/characters/[id]      — read
 *  - PUT  /api/characters/[id]      — update
 *  - DELETE /api/characters/[id]    — delete
 *
 * No vi.mock() needed — these routes have no LLM/cropper dependency.
 *
 * Each test uses a random UUID prefix on names/IDs to avoid cross-test
 * collisions within the same worker (D6). Tests within this file run
 * sequentially (vitest default); workers run in separate forks (D5).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import {
  setupAcceptance,
  baseUrl,
  expectFetch,
  makeCharacterBody,
} from "./harness";

setupAcceptance();

// Unique prefix per test-run — ensures no id collisions between runs (D6)
let prefix: string;
beforeEach(() => {
  prefix = randomUUID().slice(0, 8);
});

describe("GET /api/characters", () => {
  it("returns an array (may be empty or contain characters from prior tests)", async () => {
    const { json } = await expectFetch(`${baseUrl}/api/characters`, {}, 200);
    expect(Array.isArray(json())).toBe(true);
  });
});

describe("POST /api/characters", () => {
  it("creates a character and returns 201 with auto-generated id", async () => {
    const body = makeCharacterBody(`Hero ${prefix}`);
    const { json } = await expectFetch(
      `${baseUrl}/api/characters`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      201
    );
    const created = json<{ id: string; name: string; class: string }>();
    expect(created.id).toMatch(/^[a-z0-9-]+$/);
    expect(created.name).toBe(`Hero ${prefix}`);
    expect(created.class).toBe("Barbarian");
  });

  it("auto-suffixes id on slug collision (D18): second POST with same name gets -2 suffix", async () => {
    const sharedName = `Clash ${prefix}`;
    const body = makeCharacterBody(sharedName);
    const opts = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };

    const { json: json1 } = await expectFetch(`${baseUrl}/api/characters`, opts, 201);
    const first = json1<{ id: string }>();

    const { json: json2 } = await expectFetch(`${baseUrl}/api/characters`, opts, 201);
    const second = json2<{ id: string }>();

    // Both succeed with 201 — never 409 (D18)
    expect(first.id).toBeTruthy();
    expect(second.id).toBeTruthy();
    expect(second.id).not.toBe(first.id);
    // Slug collision logic appends -2, -3, … not -1 (see persistence/characters.ts)
    expect(second.id).toMatch(/-\d+$/);
  });

  it("returns 400 for invalid body (missing required class field)", async () => {
    await expectFetch(
      `${baseUrl}/api/characters`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Incomplete ${prefix}` }),
      },
      400
    );
  });
});

describe("GET /api/characters/[id]", () => {
  it("returns 200 with the character for a known id", async () => {
    // Create a character first
    const { json: createJson } = await expectFetch(
      `${baseUrl}/api/characters`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeCharacterBody(`Readable ${prefix}`)),
      },
      201
    );
    const { id } = createJson<{ id: string }>();

    const { json } = await expectFetch(`${baseUrl}/api/characters/${id}`, {}, 200);
    const char = json<{ id: string; name: string }>();
    expect(char.id).toBe(id);
    expect(char.name).toBe(`Readable ${prefix}`);
  });

  it("returns 404 for a non-existent id", async () => {
    await expectFetch(
      `${baseUrl}/api/characters/nonexistent-${prefix}`,
      {},
      404
    );
  });

  it("returns 400 for an invalid id (unsafe characters)", async () => {
    await expectFetch(`${baseUrl}/api/characters/UPPER_CASE`, {}, 400);
  });
});

describe("PUT /api/characters/[id]", () => {
  it("updates a character and returns 200 with the updated data", async () => {
    // Create
    const { json: createJson } = await expectFetch(
      `${baseUrl}/api/characters`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeCharacterBody(`Updatable ${prefix}`)),
      },
      201
    );
    const created = createJson<{ id: string; name: string }>();

    // Update — change level
    const { json: updateJson } = await expectFetch(
      `${baseUrl}/api/characters/${created.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...created, level: 50 }),
      },
      200
    );
    const updated = updateJson<{ id: string; level: number }>();
    expect(updated.id).toBe(created.id);
    expect(updated.level).toBe(50);
  });
});

describe("DELETE /api/characters/[id]", () => {
  it("returns 204 for an existing character and removes it", async () => {
    // Create
    const { json: createJson } = await expectFetch(
      `${baseUrl}/api/characters`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeCharacterBody(`Deletable ${prefix}`)),
      },
      201
    );
    const { id } = createJson<{ id: string }>();

    // Delete
    await expectFetch(
      `${baseUrl}/api/characters/${id}`,
      { method: "DELETE" },
      204
    );

    // Confirm gone
    await expectFetch(`${baseUrl}/api/characters/${id}`, {}, 404);
  });

  it("returns 404 when deleting a non-existent character", async () => {
    await expectFetch(
      `${baseUrl}/api/characters/ghost-${prefix}`,
      { method: "DELETE" },
      404
    );
  });
});
