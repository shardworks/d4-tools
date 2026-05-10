/**
 * Acceptance test harness.
 *
 * Boots an in-process Next.js dev server on an OS-assigned port (D8),
 * isolates each worker's DATA_DIR and SCREENSHOT_DIR via mkdtemp keyed by
 * VITEST_POOL_ID (D5), provides a stub Anthropic HTTP server for LLM
 * interception (D1), and exposes shared test helpers (D9, D13, D21).
 *
 * DESIGN NOTES
 * ─────────────
 * D1  — Next.js compiles route handlers through its own module evaluation
 *        system (independent of Node.js require()), so vi.mock() registered
 *        in this fork's Vitest module registry does NOT intercept route
 *        handler dependencies. The stub Anthropic HTTP server approach is
 *        used instead: ANTHROPIC_BASE_URL points at a local HTTP server
 *        that returns configurable responses, and ANTHROPIC_API_KEY is set
 *        to a dummy value so the route handler's key check passes.
 *        The stub defaults to returning a 401 error response (simulating an
 *        LLM failure) so that any accidental uncached path surfaces as an
 *        error. Use withAnthropicSuccess(items, fn) to configure the stub
 *        to return a success response for the duration of a test callback.
 * D5  — `pool: "forks"` in vitest.acceptance.config.ts gives each test file
 *        its own subprocess with its own process.env. The temp tree is keyed
 *        by VITEST_POOL_ID for human-readable names; mkdtemp adds a random
 *        suffix as the true uniqueness guarantee.
 * D8  — port 0 → OS-assigned; actual port read from server.address().
 * D21 — withUploadSecret sets UPLOAD_SECRET, runs the callback, restores in
 *        finally regardless of outcome.
 *
 * USAGE
 * ─────
 *   // In every acceptance test file:
 *   import { setupAcceptance, baseUrl, tmpDir, screenshotDir,
 *            expectFetch, withUploadSecret, withAnthropicSuccess,
 *            FAKE_PNG, ... } from "./harness";
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

/** Base URL of the in-process Next.js server started by setupAcceptance(). */
export let baseUrl = "";

/** Per-worker DATA_DIR root (mkdtemp'd in beforeAll). */
export let tmpDir = "";

/** Per-worker SCREENSHOT_DIR (subdirectory of tmpDir). */
export let screenshotDir = "";

// ── Stub Anthropic server state (D1) ─────────────────────────────────────────
//
// The stub HTTP server handles POST /v1/messages. By default it returns a
// 401 error (simulating an invalid API key), so any accidental cache-miss
// that reaches the real LLM path surfaces as an error response. Tests that
// need the LLM to succeed use withAnthropicSuccess(items, fn).

/** Current stub mode: null = error (401); non-null = success with these items. */
let _stubItems: unknown[] | null = null;

/** Stub Anthropic HTTP server (started per-worker in beforeAll). */
let _stubAnthropicServer: http.Server | undefined;

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
 * original value in a `finally` block (D21).
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

// ── withAnthropicSuccess (D1) ─────────────────────────────────────────────────

/**
 * Configures the stub Anthropic server to return a success response with the
 * given items array, runs `fn`, then restores the stub to error mode.
 *
 * The stub defaults to returning a 401 error (simulating an invalid API key).
 * Use this helper for tests that exercise the cache-miss happy path (LLM called
 * and succeeds → cache written → response carries the parsed entry).
 *
 * @param items - The items array to include in the LLM tool_use response.
 *                Pass [] for "no-item-detected" behaviour.
 * @param fn    - Test callback to run while the stub is in success mode.
 */
export async function withAnthropicSuccess<T>(
  items: unknown[],
  fn: () => Promise<T>
): Promise<T> {
  _stubItems = items;
  try {
    return await fn();
  } finally {
    _stubItems = null;
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Registers beforeAll / afterAll hooks that:
 *  - create a per-worker mkdtemp tree and set DATA_DIR / SCREENSHOT_DIR (D5)
 *  - start the stub Anthropic HTTP server and configure env vars (D1)
 *  - boot an in-process Next.js dev server on port 0 (D8)
 *
 * Call this at the top level of each acceptance test file.
 */
export function setupAcceptance() {
  const origDataDir = process.env.DATA_DIR;
  const origScreenshotDir = process.env.SCREENSHOT_DIR;
  const origAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const origAnthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;

  let server: http.Server | undefined;

  beforeAll(async () => {
    // ── Per-worker temp tree (D5) ─────────────────────────────────────────
    const workerId = process.env.VITEST_POOL_ID ?? "0";
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `d4-acc-${workerId}-`));
    screenshotDir = path.join(tmpDir, "screenshots");
    await fs.mkdir(screenshotDir, { recursive: true });

    // ── Env vars ──────────────────────────────────────────────────────────
    process.env.DATA_DIR = tmpDir;
    process.env.SCREENSHOT_DIR = screenshotDir;
    delete process.env.UPLOAD_SECRET;

    // ── Stub Anthropic server (D1) ────────────────────────────────────────
    // The stub intercepts all Anthropic API calls from route handlers. It
    // defaults to returning a 401 (invalid API key) so accidental cache-miss
    // paths surface as errors. Use withAnthropicSuccess(items, fn) to enable
    // success mode for specific tests.
    _stubAnthropicServer = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/v1/messages") {
        // Drain request body (required before responding)
        req.resume();
        req.on("end", () => {
          if (_stubItems === null) {
            // Default: simulate authentication failure
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: {
                  type: "authentication_error",
                  message: "invalid x-api-key",
                },
              })
            );
          } else {
            // Success mode: return a tool_use response with the configured items
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                id: "msg_stub",
                type: "message",
                role: "assistant",
                content: [
                  {
                    type: "tool_use",
                    id: "toolu_stub",
                    name: "record_extracted_items",
                    input: { items: _stubItems },
                  },
                ],
                model: "claude-sonnet-4-5-20250929",
                stop_reason: "tool_use",
                usage: { input_tokens: 10, output_tokens: 10 },
              })
            );
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve, reject) => {
      _stubAnthropicServer!.on("error", reject);
      _stubAnthropicServer!.listen(0, () => resolve());
    });

    const stubAddr = _stubAnthropicServer.address() as { port: number };
    process.env.ANTHROPIC_API_KEY = "test-stub-key";
    process.env.ANTHROPIC_BASE_URL = `http://localhost:${stubAddr.port}`;

    // ── Boot Next.js in-process dev server (D8) ───────────────────────────
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

    // Close the stub Anthropic server
    await new Promise<void>((resolve) => {
      if (_stubAnthropicServer) {
        _stubAnthropicServer.close(() => resolve());
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
    if (origAnthropicApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = origAnthropicApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (origAnthropicBaseUrl !== undefined) {
      process.env.ANTHROPIC_BASE_URL = origAnthropicBaseUrl;
    } else {
      delete process.env.ANTHROPIC_BASE_URL;
    }

    // Clean up temp tree
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {
        // Ignore cleanup errors — the OS will eventually reclaim /tmp
      });
    }
  }, 30_000);
}
