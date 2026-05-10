/**
 * Acceptance test harness.
 *
 * Boots an in-process Next.js production server on an OS-assigned port (D1, D8),
 * isolates each worker's DATA_DIR and SCREENSHOT_DIR via mkdtemp keyed by
 * VITEST_POOL_ID (D5), and provides shared test helpers (D9, D13, D21).
 *
 * DESIGN NOTES
 * ─────────────
 * D1  — `next({ dev: true })` compiles route handlers on-demand via Node.js
 *        require(), so vi.mock() registered in this fork's Vitest module
 *        registry intercepts those require() calls before the real module is
 *        loaded. Production (Turbopack) builds inline dependencies into the
 *        bundle, making vi.mock() unreachable; dev mode preserves the reach.
 *        The `next build` step in pnpm test:acceptance still runs (D19) to
 *        catch build-time errors before any test executes — dev mode is only
 *        for the in-process runtime server.
 * D5  — `pool: "forks"` in vitest.acceptance.config.ts gives each test file
 *        its own subprocess with its own process.env. The temp tree is keyed
 *        by VITEST_POOL_ID for human-readable names; mkdtemp adds a random
 *        suffix as the true uniqueness guarantee.
 * D8  — port 0 → OS-assigned; actual port read from server.address().
 * D20 — ANTHROPIC_API_KEY is deliberately NOT set. vi.mock() short-circuits
 *        before the real function runs; an unset key surfaces a loud throw if
 *        a mock is accidentally missed.
 * D21 — withUploadSecret sets UPLOAD_SECRET, runs the callback, restores in
 *        finally regardless of outcome.
 *
 * USAGE
 * ─────
 *   // In every acceptance test file:
 *   import { setupAcceptance, baseUrl, tmpDir, screenshotDir,
 *            expectFetch, withUploadSecret, FAKE_PNG, ... } from "./harness";
 *
 *   setupAcceptance(); // registers beforeAll / afterAll
 *
 *   it("...", async () => {
 *     const { json } = await expectFetch(`${baseUrl}/api/characters`, {}, 200);
 *   });
 */

import { beforeAll, afterAll } from "vitest";
import * as http from "http";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import type { CacheEntry } from "@/lib/triage/types";

// ── Live-binding exports ──────────────────────────────────────────────────────
//
// These are set inside beforeAll and are readable in test callbacks (which run
// after beforeAll completes). ESM live bindings make the most-recent value
// visible to any importer at the time of access.

/** Base URL of the in-process Next.js server started by setupAcceptance(). */
export let baseUrl = "";

/** Per-worker DATA_DIR root (mkdtemp'd in beforeAll). */
export let tmpDir = "";

/** Per-worker SCREENSHOT_DIR (subdirectory of tmpDir). */
export let screenshotDir = "";

/**
 * Result of the URL-encoding probe (D15). True if Next.js decodes a
 * percent-encoded slash (%2F) in a path segment back to a literal slash,
 * which would make `encodeURIComponent('../foo.png')` = `..%2Ffoo.png` arrive
 * in params.name as `../foo.png`. False if the encoded form is preserved.
 *
 * Both outcomes result in the handler returning 404 (GET) or 400 (DELETE) for
 * path-traversal filenames, so tests use this value for documentation rather
 * than branching assertions.
 */
export let nextDecodesEncodedSlash = false;

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Minimal valid PNG header — routes validate MIME from Blob.type, not bytes. */
export const FAKE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Second PNG with different content (different SHA-256 hash). */
export const FAKE_PNG_B = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b,
]);

/** Canonical CropResult stub — single crop, detected, no resize. */
export function defaultCropResult(bytes: Buffer = FAKE_PNG) {
  return {
    images: [{ bytes, mediaType: "image/png" as const }],
    detected: true,
    resized: false,
    encodedBytes: Math.ceil(bytes.length / 3) * 4,
  };
}

/** Canonical CacheEntry stub — kind "item" with no items. */
export function makeCacheEntry(overrides: Partial<CacheEntry> = {}): CacheEntry {
  return {
    kind: "item" as const,
    items: [],
    model: "test-model",
    timestamp: new Date().toISOString(),
    ...overrides,
  } as CacheEntry;
}

/** Minimal character creation body for POST /api/characters. */
export function makeCharacterBody(name: string) {
  return {
    name,
    class: "Barbarian" as const,
    level: 1,
  };
}

/** Minimal build creation body for POST /api/builds. */
export function makeBuildBody(characterId: string, name: string) {
  return { characterId, name, notes: "" };
}

// ── expectFetch helper (D13) ──────────────────────────────────────────────────

export interface FetchResult {
  res: Response;
  bodyText: string;
  /** Parse the body as JSON. Throws if body is not valid JSON. */
  json<T = unknown>(): T;
}

interface ExpectFetchOpts {
  /** Maximum body excerpt length in failure messages (default: 512). */
  maxBodyExcerpt?: number;
}

/**
 * Fetches `url` with `init`, reads the response body, and asserts status.
 *
 * On status mismatch throws an Error whose message names the HTTP method,
 * route path, expected status, actual status, and a body excerpt — ensuring
 * failure messages are actionable (D13).
 */
export async function expectFetch(
  url: string,
  init: RequestInit,
  expectedStatus: number,
  opts?: ExpectFetchOpts
): Promise<FetchResult> {
  const res = await fetch(url, init);
  const bodyText = await res.text();

  if (res.status !== expectedStatus) {
    const method = (init.method ?? "GET").toUpperCase();
    const routePath = (() => {
      try {
        return new URL(url).pathname;
      } catch {
        return url;
      }
    })();
    const excerpt = bodyText.slice(0, opts?.maxBodyExcerpt ?? 512);
    throw new Error(
      `expectFetch: ${method} ${routePath}\n` +
        `  expected status ${expectedStatus}, got ${res.status}\n` +
        `  body: ${excerpt}`
    );
  }

  return {
    res,
    bodyText,
    json<T = unknown>(): T {
      return JSON.parse(bodyText) as T;
    },
  };
}

// ── withUploadSecret (D21) ────────────────────────────────────────────────────

/**
 * Sets process.env.UPLOAD_SECRET to `value`, runs `fn`, then restores the
 * original value in a `finally` block (D21 — restore-in-finally is enforced
 * as a framework guarantee, not author discipline).
 */
export async function withUploadSecret<T>(
  value: string,
  fn: () => Promise<T>
): Promise<T> {
  const orig = process.env.UPLOAD_SECRET;
  try {
    process.env.UPLOAD_SECRET = value;
    return await fn();
  } finally {
    if (orig !== undefined) {
      process.env.UPLOAD_SECRET = orig;
    } else {
      delete process.env.UPLOAD_SECRET;
    }
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Registers beforeAll / afterAll hooks that:
 *  - create a per-worker mkdtemp tree and set DATA_DIR / SCREENSHOT_DIR (D5)
 *  - boot an in-process Next.js production server on port 0 (D1, D8)
 *  - run the URL-encoding probe (D15)
 *
 * Call this at the top level of each acceptance test file (after vi.mock()
 * hoists and imports).
 */
export function setupAcceptance() {
  const origDataDir = process.env.DATA_DIR;
  const origScreenshotDir = process.env.SCREENSHOT_DIR;

  let server: http.Server | undefined;

  beforeAll(async () => {
    // ── Per-worker temp tree (D5) ─────────────────────────────────────────
    const workerId = process.env.VITEST_POOL_ID ?? "0";
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `d4-acc-${workerId}-`));
    screenshotDir = path.join(tmpDir, "screenshots");
    await fs.mkdir(screenshotDir, { recursive: true });

    // ── Env vars (read by route handlers at request time) ─────────────────
    process.env.DATA_DIR = tmpDir;
    process.env.SCREENSHOT_DIR = screenshotDir;
    // D20: deliberately DO NOT set ANTHROPIC_API_KEY.
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.UPLOAD_SECRET;

    // ── Boot Next.js in-process dev server (D1, D8) ──────────────────────
    // next({ dev: true }) compiles route handlers on-demand via Node.js
    // require(). Vitest patches require() before anything else runs (vi.mock()
    // calls are hoisted above all imports), so when the route handler module
    // is first loaded on the initial request it goes through Vitest's module
    // registry and picks up the registered mocks.
    //
    // Production builds (next({ dev: false })) inline dependencies via
    // Turbopack, making vi.mock() unreachable. Dev mode preserves the module
    // boundary and vi.mock() reach (D2, Acceptance Signal §4).
    //
    // The `next build` step in pnpm test:acceptance (D19) still validates the
    // build before vitest starts; this dev-mode server is only used at runtime.
    const nextFn = (await import("next")).default;
    const app = nextFn({ dev: true, dir: process.cwd() });
    await app.prepare();

    const handle = app.getRequestHandler();
    server = http.createServer((req, res) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void handle(req as any, res as any);
    });

    await new Promise<void>((resolve, reject) => {
      server!.on("error", reject);
      server!.listen(0, () => resolve());
    });

    const addr = server.address() as { port: number };
    baseUrl = `http://localhost:${addr.port}`;

    // ── URL-encoding probe (D15) ──────────────────────────────────────────
    // encodeURIComponent('../probe.png') = '..%2Fprobe.png'
    // If Next.js decodes %2F → '/', params.name becomes '../probe.png'.
    //   GET handler: no explicit '..' check → dir-listing miss → 404
    //   DELETE handler: '..' check → 400
    // If Next.js preserves encoding, name = '..%2Fprobe.png'.
    //   name.includes('..') is true either way → DELETE still 400.
    // The probe calls GET and records whether Next normalises the URL or passes
    // the decoded segment. Both GET outcomes are 404; status 400 would mean
    // routing-layer rejection (Next.js treats the decoded form as traversal).
    try {
      const probeUrl = `${baseUrl}/api/triage/screenshots/${encodeURIComponent(
        "../probe.png"
      )}`;
      const probeRes = await fetch(probeUrl);
      // 400 → routing layer or handler blocked traversal; segment was decoded
      // 404 → handler got the name, not found in dir listing
      nextDecodesEncodedSlash = probeRes.status === 400;
    } catch {
      nextDecodesEncodedSlash = false;
    }
  }, 90_000);

  afterAll(async () => {
    // Close the HTTP listener
    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });

    // Restore env vars
    if (origDataDir !== undefined) {
      process.env.DATA_DIR = origDataDir;
    } else {
      delete process.env.DATA_DIR;
    }
    if (origScreenshotDir !== undefined) {
      process.env.SCREENSHOT_DIR = origScreenshotDir;
    } else {
      delete process.env.SCREENSHOT_DIR;
    }

    // Clean up temp tree
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {
        // Ignore cleanup errors — the OS will eventually reclaim /tmp
      });
    }
  }, 30_000);
}
