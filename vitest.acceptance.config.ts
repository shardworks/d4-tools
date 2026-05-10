/**
 * Vitest config for the HTTP-server acceptance test suite.
 *
 * Key differences from the default vitest.config.ts:
 *
 * - include: scoped to __tests__/acceptance/** only.
 * - pool: "forks" — each test file runs in a separate subprocess so
 *   process.env mutations (DATA_DIR, SCREENSHOT_DIR) are isolated per
 *   worker without thread-level races. This is required because the
 *   in-process Next.js dev server reads env vars at request time, and
 *   the thread pool's shared process.env would produce cross-worker races.
 * - fileParallelism: false — Next.js dev mode enforces a single-instance
 *   lock file per project directory. Running multiple forks concurrently
 *   would cause all-but-one to fail on `app.prepare()`. Sequential
 *   execution (one file at a time) avoids the conflict: each fork starts
 *   the server, runs its tests, and shuts down before the next fork begins.
 * - hookTimeout/testTimeout: elevated because beforeAll boots a Next.js
 *   dev server which compiles route handlers on first request.
 *   The preceding `next build` step (D19) validates build correctness
 *   before vitest starts; the runtime server uses dev mode so vi.mock()
 *   calls registered in the Vitest fork reach route handler require() calls.
 *
 * This config MUST NOT be merged into vitest.config.ts — the acceptance
 * suite's build precondition (next build) is a hard cost that must not
 * land on the inner-loop `pnpm test` path (D7, D19).
 */

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/acceptance/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    pool: "forks",
    // fileParallelism: false — run test files sequentially (one at a time).
    // Next.js dev mode enforces a single-instance lock file per project
    // directory. Running multiple forks concurrently would cause all-but-one
    // to fail on `app.prepare()`. Sequential execution ensures each fork's
    // server is shut down before the next fork's beforeAll starts a new one.
    fileParallelism: false,
    // 90 s for beforeAll (dev server startup + first-request compilation)
    hookTimeout: 90_000,
    // 30 s per individual test (allows for on-demand route compilation)
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
