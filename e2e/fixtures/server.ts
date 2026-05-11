/**
 * Per-spec next dev server spawner (D6).
 *
 * Each spec calls startNextServer() in beforeAll to get an isolated d4-tools
 * instance bound to a unique port with its own DATA_DIR and SCREENSHOT_DIR.
 * tearDown() in afterAll kills the process and all its descendants.
 */

import { spawn, ChildProcess } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../../");

/**
 * Returns a writable temp directory base for NEXT_DIST_DIR.
 *
 * We always prefer a workspace-local tmp/ subdirectory so that:
 *   1. tsconfig.json's `exclude: ["tmp/**"]` suppresses any type-path entries
 *      that Next.js appends for custom distDirs.
 *   2. Cleanup on test teardown is deterministic (rm -rf within the repo tree).
 *
 * If $E2E_TMPDIR is set it is used as-is (Docker / CI override).
 */
async function getTmpBase(): Promise<string> {
  const override = process.env.E2E_TMPDIR;
  if (override) return override;
  // Always use workspace-local tmp/e2e so tsconfig exclude covers the path
  const localTmp = path.join(REPO_ROOT, "tmp", "e2e");
  await fs.mkdir(localTmp, { recursive: true });
  return localTmp;
}
/** Maximum time to wait for the server to be ready (ms). */
const READY_TIMEOUT_MS = 120_000;
/** Poll interval while waiting for server readiness (ms). */
const POLL_INTERVAL_MS = 500;

export interface TestServerOptions {
  port: number;
  dataDir: string;
  screenshotDir: string;
  anthropicApiUrl: string;
  /** Additional env vars to pass to the server process. */
  extraEnv?: Record<string, string>;
}

export interface TestServer {
  /** Base URL: http://127.0.0.1:<port> */
  url: string;
  port: number;
  /** Temp directory used as the Next.js distDir (.next equivalent). */
  distDir: string;
  stop(): Promise<void>;
}

/**
 * Spawns `next dev --port <port>` and waits until the server is accepting
 * requests. Returns a handle with a stop() teardown function.
 *
 * Environment passed to the child process:
 *   - Inherits process.env (for PATH, HOME, etc.)
 *   - Overrides: DATA_DIR, SCREENSHOT_DIR, ANTHROPIC_API_KEY, ANTHROPIC_API_URL
 *   - NODE_ENV=test (prevents telemetry)
 *   - NEXT_TELEMETRY_DISABLED=1
 */
export async function startNextServer(opts: TestServerOptions): Promise<TestServer> {
  const { port, dataDir, screenshotDir, anthropicApiUrl, extraEnv = {} } = opts;

  // Each server instance gets its own .next dir so multiple next dev processes
  // can coexist in the same repo without hitting the single-instance lock.
  const tmpBase = await getTmpBase();
  const distDir = await fs.mkdtemp(path.join(tmpBase, "d4-e2e-next-"));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATA_DIR: dataDir,
    SCREENSHOT_DIR: screenshotDir,
    ANTHROPIC_API_KEY: "test-key-not-real",
    ANTHROPIC_API_URL: anthropicApiUrl,
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_DIST_DIR: distDir,
    ...extraEnv,
  };

  // Bind to 0.0.0.0 so the per-spec server is reachable from outside the
  // container when running in Docker remote-monitor mode.  In local dev this
  // is equivalent to 127.0.0.1 for practical purposes.
  const bindHost = "0.0.0.0";

  const child = spawn(
    "pnpm",
    ["exec", "next", "dev", "--port", String(port), "--hostname", bindHost],
    {
      cwd: REPO_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"] as const,
      detached: false,
    }
  );

  // Capture stderr/stdout for debugging on failure
  // Use a mutable object so waitForServer always sees the latest output.
  const output = { buffer: "" };
  child.stdout?.on("data", (chunk: Buffer) => {
    output.buffer += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output.buffer += chunk.toString();
  });

  child.on("error", (err) => {
    console.error("[test-server] spawn error:", err);
  });

  // Poll on 127.0.0.1 for readiness (loopback always works regardless of bindHost)
  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url, READY_TIMEOUT_MS, POLL_INTERVAL_MS, child, output);

  return {
    url,
    port,
    distDir,
    stop: async () => {
      await stopProcess(child);
      // Clean up the temp .next dir
      await fs.rm(distDir, { recursive: true, force: true });
    },
  };
}

async function waitForServer(
  url: string,
  timeoutMs: number,
  pollMs: number,
  child: ChildProcess,
  output: { buffer: string }
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // Check if process exited prematurely
    if (child.exitCode !== null) {
      throw new Error(
        `[test-server] next dev process exited prematurely (code ${child.exitCode}).\nOutput:\n${output.buffer}`
      );
    }

    try {
      // Use a 30s per-request timeout so we don't abort during Turbopack's
      // lazy route compilation (first request can take a few seconds).
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      // Any response (even 404, 500, redirect) means the server is up
      if (res.status < 600) {
        return;
      }
    } catch {
      // Connection refused / timeout — not ready yet
    }

    await sleep(pollMs);
  }

  // Timeout — kill the process and throw
  child.kill("SIGKILL");
  throw new Error(
    `[test-server] Timed out waiting for next dev at ${url} after ${timeoutMs}ms.\nOutput:\n${output.buffer}`
  );
}

function stopProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once("close", () => resolve());
    child.kill("SIGTERM");
    // Force-kill after 5 seconds
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }, 5000);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
