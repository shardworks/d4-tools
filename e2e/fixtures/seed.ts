/**
 * Data seeding helpers for e2e specs (D7, D24, D29, D31).
 *
 * All helpers set process.env.DATA_DIR and SCREENSHOT_DIR before calling
 * lib/persistence and lib/triage/cache helpers, then restore them.
 * No hand-written JSON — everything goes through the Zod-validated persistence
 * layer so broken fixtures fail loud.
 *
 * Usage:
 *   const seeder = createSeeder({ dataDir, screenshotDir });
 *   await seeder.saveCharacter({ id: "my-sorcerer", name: "...", class: "Sorcerer", level: 50 });
 *   await seeder.saveBuild({ id: "my-build", characterId: "my-sorcerer", name: "..." });
 *   await seeder.setActiveBuild("my-build");
 *   const hash = await seeder.seedScreenshot("helm-sorcerer.png", { mtime: new Date("2026-01-01") });
 *   await seeder.seedCacheEntry(hash, "helm-sorcerer");
 */

import * as fs from "fs/promises";
import * as path from "path";
import { createHash } from "crypto";
import type { Character, Build, D4Class } from "../../lib/schema";
// Static imports — processed by esbuild at compile time so the @/ path alias
// and TypeScript resolve correctly in Playwright's environment.
import { saveCharacter as _saveCharacter } from "../../lib/persistence/characters";
import { saveBuild as _saveBuild } from "../../lib/persistence/builds";
import { setActiveBuildId as _setActiveBuildId } from "../../lib/persistence/active-build";
import { writeCachedParse as _writeCachedParse } from "../../lib/triage/cache";

// ─── Concurrency-safe env-var mutation ───────────────────────────────────────
//
// The persistence helpers (saveCharacter, saveBuild, etc.) read DATA_DIR and
// SCREENSHOT_DIR from process.env at call time.  When multiple createTestContext()
// calls run concurrently (e.g. via Promise.all in build-detail.spec.ts), their
// withDirs() wrappers would interleave and corrupt each other's env vars.
//
// This module-level promise chain acts as a simple mutex: every withDirs()
// call appends to the chain so seeds are serialised, even across seeder
// instances created in different specs.

let _seedMutex: Promise<void> = Promise.resolve();

/**
 * Acquires the module-level seed mutex, runs fn, then releases.
 * All calls are serialised so no two withDirs() bodies overlap.
 */
function withMutex<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const slot = new Promise<void>((r) => {
    release = r;
  });
  const prev = _seedMutex;
  _seedMutex = slot;

  return prev.then(fn).finally(release) as Promise<T>;
}

// ─── Permissive input types for seeding ──────────────────────────────────────
// The persistence layer fills in Zod defaults at save time; we only need
// the truly required fields here.

export interface CharacterSeedInput {
  id: string;
  name: string;
  class: D4Class;
  level?: number;
  equippedItems?: Record<string, unknown>;
  skillSelections?: unknown[];
  paragonAllocation?: unknown;
  playstyleConstraints?: unknown[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BuildSeedInput {
  id: string;
  characterId: string;
  name: string;
  notes?: string;
  targetItems?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");

// ─── Seeder factory ───────────────────────────────────────────────────────────

export interface SeederOptions {
  dataDir: string;
  screenshotDir: string;
}

export interface ScreenshotSeedOptions {
  /** mtime to assign to the seeded file (for deterministic gallery ordering). */
  mtime?: Date;
  /** Source filename in e2e/fixtures/screenshots/ (default: same as destFilename). */
  sourceFilename?: string;
}

export interface Seeder {
  saveCharacter(char: CharacterSeedInput): Promise<Character>;
  saveBuild(build: BuildSeedInput): Promise<Build>;
  setActiveBuild(buildId: string): Promise<void>;
  /**
   * Copies a fixture screenshot to SCREENSHOT_DIR and sets its mtime.
   * Returns the SHA-256 hash of the file bytes (used as cache key).
   */
  seedScreenshot(destFilename: string, opts?: ScreenshotSeedOptions): Promise<string>;
  /**
   * Seeds a pre-parsed CacheEntry from a *-recorded.json fixture file.
   * Call seedScreenshot first to get the hash.
   */
  seedCacheEntry(hash: string, fixtureName: string): Promise<void>;
  /** Writes an arbitrary JSON string as a build file (for D25 corrupt-JSON scenario). */
  writeRawBuildFile(buildId: string, raw: string): Promise<void>;
  /** Writes data/damage-config.local.json for D26 config-gap scenario. */
  writeDamageConfigOverride(override: Record<string, unknown>): Promise<void>;
}

/**
 * Creates a seeder that writes to the given temp dirs.
 * Sets process.env.DATA_DIR / SCREENSHOT_DIR only while holding the module-level
 * seed mutex, then restores the original values.  All calls across all seeder
 * instances are serialised so concurrent createTestContext() calls via
 * Promise.all cannot cross-contaminate each other's data directories.
 */
export function createSeeder(opts: SeederOptions): Seeder {
  const { dataDir, screenshotDir } = opts;

  function withDirs<T>(fn: () => Promise<T>): Promise<T> {
    return withMutex(async () => {
      const origData = process.env.DATA_DIR;
      const origScreenshot = process.env.SCREENSHOT_DIR;
      process.env.DATA_DIR = dataDir;
      process.env.SCREENSHOT_DIR = screenshotDir;
      try {
        return await fn();
      } finally {
        // Restore original values (undefined → delete the key)
        if (origData === undefined) delete process.env.DATA_DIR;
        else process.env.DATA_DIR = origData;
        if (origScreenshot === undefined) delete process.env.SCREENSHOT_DIR;
        else process.env.SCREENSHOT_DIR = origScreenshot;
      }
    });
  }

  return {
    async saveCharacter(char) {
      return withDirs(async () => {
        // Cast through unknown to satisfy the strict persistence layer type;
        // Zod fills in defaults (paragonAllocation, skillSelections, etc.) at parse time
        return _saveCharacter(char as unknown as Omit<Character, "id"> & { id: string });
      });
    },

    async saveBuild(build) {
      return withDirs(async () => {
        return _saveBuild(build as unknown as Omit<Build, "id"> & { id: string });
      });
    },

    async setActiveBuild(buildId) {
      return withDirs(async () => {
        await _setActiveBuildId(buildId);
      });
    },

    async seedScreenshot(destFilename, opts = {}) {
      const { mtime, sourceFilename } = opts;
      const srcName = sourceFilename ?? destFilename;
      const srcPath = path.join(SCREENSHOTS_DIR, srcName);
      const destPath = path.join(screenshotDir, destFilename);

      const bytes = await fs.readFile(srcPath);
      await fs.writeFile(destPath, bytes);

      if (mtime) {
        await fs.utimes(destPath, mtime, mtime);
      }

      return createHash("sha256").update(bytes).digest("hex");
    },

    async seedCacheEntry(hash, fixtureName) {
      return withDirs(async () => {
        const fixturePath = path.join(SCREENSHOTS_DIR, `${fixtureName}-recorded.json`);
        const raw = await fs.readFile(fixturePath, "utf-8");
        const entry = JSON.parse(raw) as Record<string, unknown>;
        // cast: we trust fixture files are valid CacheEntry shapes
        await _writeCachedParse(hash, entry as Parameters<typeof _writeCachedParse>[1]);
      });
    },

    async writeRawBuildFile(buildId, raw) {
      const buildsDir = path.join(dataDir, "builds");
      await fs.mkdir(buildsDir, { recursive: true });
      await fs.writeFile(path.join(buildsDir, `${buildId}.json`), raw, "utf-8");
    },

    async writeDamageConfigOverride(override) {
      await fs.writeFile(
        path.join(dataDir, "damage-config.local.json"),
        JSON.stringify(override, null, 2),
        "utf-8"
      );
    },
  };
}
