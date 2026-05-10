/**
 * Acceptance tests for the Builds API (wire-level, via real HTTP).
 *
 * Covers:
 *  - GET    /api/builds               — list (with optional ?characterId filter)
 *  - POST   /api/builds               — create
 *  - GET    /api/builds/[id]          — read
 *  - PUT    /api/builds/[id]          — update
 *  - DELETE /api/builds/[id]          — delete
 *
 * No vi.mock() needed — these routes have no LLM/cropper dependency.
 *
 * Each test uses a random UUID prefix to avoid cross-test ID collisions (D6).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import {
  setupAcceptance,
  baseUrl,
  expectFetch,
  makeCharacterBody,
  makeBuildBody,
} from "./harness";

setupAcceptance();

let prefix: string;
beforeEach(() => {
  prefix = randomUUID().slice(0, 8);
});

/** Create a character and return its id (prerequisite for build creation). */
async function createCharacter(): Promise<string> {
  const { json } = await expectFetch(
    `${baseUrl}/api/characters`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeCharacterBody(`Build Owner ${prefix}`)),
    },
    201
  );
  return json<{ id: string }>().id;
}

describe("GET /api/builds", () => {
  it("returns an array", async () => {
    const { json } = await expectFetch(`${baseUrl}/api/builds`, {}, 200);
    expect(Array.isArray(json())).toBe(true);
  });

  it("filters by characterId when ?characterId= is provided", async () => {
    const charId = await createCharacter();
    const buildBody = makeBuildBody(charId, `Filtered Build ${prefix}`);

    // Create a build linked to charId
    await expectFetch(
      `${baseUrl}/api/builds`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody),
      },
      201
    );

    // Create another build linked to a different characterId
    const otherCharId = await createCharacter();
    await expectFetch(
      `${baseUrl}/api/builds`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeBuildBody(otherCharId, `Other Build ${prefix}`)),
      },
      201
    );

    // Filter by charId — should only see the first build
    const { json } = await expectFetch(
      `${baseUrl}/api/builds?characterId=${charId}`,
      {},
      200
    );
    const builds = json<{ characterId: string }[]>();
    expect(Array.isArray(builds)).toBe(true);
    expect(builds.every((b) => b.characterId === charId)).toBe(true);
    expect(builds.length).toBeGreaterThanOrEqual(1);
  });
});

describe("POST /api/builds", () => {
  it("creates a build and returns 201 with auto-generated id", async () => {
    const charId = await createCharacter();
    const { json } = await expectFetch(
      `${baseUrl}/api/builds`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeBuildBody(charId, `New Build ${prefix}`)),
      },
      201
    );
    const build = json<{ id: string; characterId: string; name: string }>();
    expect(build.id).toMatch(/^[a-z0-9-]+$/);
    expect(build.characterId).toBe(charId);
    expect(build.name).toBe(`New Build ${prefix}`);
  });

  it("returns 400 for invalid body (missing characterId)", async () => {
    await expectFetch(
      `${baseUrl}/api/builds`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Orphan Build ${prefix}` }),
      },
      400
    );
  });
});

describe("GET /api/builds/[id]", () => {
  it("returns 200 with the build for a known id", async () => {
    const charId = await createCharacter();
    const { json: createJson } = await expectFetch(
      `${baseUrl}/api/builds`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeBuildBody(charId, `Readable Build ${prefix}`)),
      },
      201
    );
    const { id } = createJson<{ id: string }>();

    const { json } = await expectFetch(`${baseUrl}/api/builds/${id}`, {}, 200);
    const build = json<{ id: string; name: string }>();
    expect(build.id).toBe(id);
    expect(build.name).toBe(`Readable Build ${prefix}`);
  });

  it("returns 404 for a non-existent id", async () => {
    await expectFetch(`${baseUrl}/api/builds/nonexistent-${prefix}`, {}, 404);
  });

  it("returns 400 for an invalid id (unsafe characters)", async () => {
    await expectFetch(`${baseUrl}/api/builds/UPPER_CASE_ID`, {}, 400);
  });
});

describe("PUT /api/builds/[id]", () => {
  it("updates a build and returns 200 with updated data", async () => {
    const charId = await createCharacter();
    const { json: createJson } = await expectFetch(
      `${baseUrl}/api/builds`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeBuildBody(charId, `Updatable Build ${prefix}`)),
      },
      201
    );
    const created = createJson<{ id: string; characterId: string }>();

    const { json: updateJson } = await expectFetch(
      `${baseUrl}/api/builds/${created.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...created,
          name: `Updated Build ${prefix}`,
          notes: "Updated notes",
        }),
      },
      200
    );
    const updated = updateJson<{ id: string; name: string; notes: string }>();
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe(`Updated Build ${prefix}`);
    expect(updated.notes).toBe("Updated notes");
  });
});

describe("DELETE /api/builds/[id]", () => {
  it("returns 204 for an existing build and removes it", async () => {
    const charId = await createCharacter();
    const { json: createJson } = await expectFetch(
      `${baseUrl}/api/builds`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeBuildBody(charId, `Deletable Build ${prefix}`)),
      },
      201
    );
    const { id } = createJson<{ id: string }>();

    await expectFetch(`${baseUrl}/api/builds/${id}`, { method: "DELETE" }, 204);
    await expectFetch(`${baseUrl}/api/builds/${id}`, {}, 404);
  });

  it("returns 404 when deleting a non-existent build", async () => {
    await expectFetch(
      `${baseUrl}/api/builds/ghost-${prefix}`,
      { method: "DELETE" },
      404
    );
  });
});
