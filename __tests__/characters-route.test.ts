/**
 * Regression test: POST /api/characters with no id in body.
 *
 * Exercises the actual route handler (not a mock), verifying that:
 * - A body with valid name/class/level but no id is accepted with 201
 * - The response JSON contains a slug-derived id
 * - The character file exists on disk under DATA_DIR/characters/<id>.json
 *
 * Uses the dynamic-import-after-env-set pattern from __tests__/persistence.test.ts
 * so the DATA_DIR env var is picked up before any persistence modules load.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("POST /api/characters — new character (no id in body)", () => {
  let tmpDir: string;
  const origDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "d4-chars-route-test-"));
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    process.env.DATA_DIR = origDataDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns 201, slug-derived id, and writes the character file to disk", async () => {
    // Dynamic import to pick up the DATA_DIR env change
    const { POST } = await import("../app/api/characters/route");

    const body = {
      name: "Ice Shards Sorcerer",
      class: "Sorcerer",
      level: 60,
    };

    const request = new Request("http://localhost/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await POST(request);

    // Assert 201
    expect(response.status).toBe(201);

    // Assert response JSON has a slug-derived id
    const json = await response.json();
    expect(json.id).toBeTruthy();
    expect(json.id).toMatch(/^[a-z0-9-]+$/);
    // "Ice Shards Sorcerer" → slugify → "ice-shards-sorcerer"
    expect(json.id).toBe("ice-shards-sorcerer");
    expect(json.name).toBe("Ice Shards Sorcerer");
    expect(json.class).toBe("Sorcerer");
    expect(json.level).toBe(60);

    // Assert file exists at DATA_DIR/characters/<id>.json
    const charPath = path.join(tmpDir, "characters", `${json.id}.json`);
    const fileExists = await fs
      .stat(charPath)
      .then(() => true)
      .catch(() => false);
    expect(fileExists).toBe(true);

    // Assert file content is valid JSON with the correct id
    const raw = await fs.readFile(charPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.id).toBe("ice-shards-sorcerer");
    expect(parsed.name).toBe("Ice Shards Sorcerer");
  });

  it("returns 400 when body is missing required name field", async () => {
    const { POST } = await import("../app/api/characters/route");

    const request = new Request("http://localhost/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class: "Rogue", level: 1 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("does not require id in body — slug is always generated server-side", async () => {
    const { POST } = await import("../app/api/characters/route");

    // Deliberately include no `id` field
    const request = new Request("http://localhost/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Bone Spear Necromancer",
        class: "Necromancer",
        // no id
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.id).toBe("bone-spear-necromancer");

    // File must exist
    const charPath = path.join(tmpDir, "characters", `${json.id}.json`);
    expect(
      await fs
        .stat(charPath)
        .then(() => true)
        .catch(() => false)
    ).toBe(true);
  });
});
