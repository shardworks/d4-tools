/**
 * Playwright configuration for d4-tools end-to-end tests.
 *
 * Run modes:
 *   pnpm test:e2e   — headless local/CI run
 *   pnpm e2e:ui     — Docker-based remote-monitor UI run (see docker-compose.e2e.yml)
 *
 * Per-spec server lifecycle: each spec boots its own `next dev` on a unique
 * OS-assigned port via the fixture in e2e/fixtures/index.ts.  There is no
 * global webServer block here — that would risk starting a server against the
 * developer's real ./data directory, polluting production data.
 */

import { defineConfig, devices } from "@playwright/test";

const workers = process.env.PLAYWRIGHT_WORKERS
  ? parseInt(process.env.PLAYWRIGHT_WORKERS, 10)
  : 2;

export default defineConfig({
  // Spec files live under e2e/ with .spec.ts suffix — outside vitest's *.test.ts glob
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",

  // Two workers by default; each spec runs its own next dev (heavy but isolated)
  workers,

  // Allow each test 2 minutes (default 30s is too short once a next dev server spins up)
  // Also governs beforeAll/afterAll hook timeouts unless overridden with test.setTimeout().
  timeout: 120_000,

  // Retry once in CI, zero locally
  retries: process.env.CI ? 1 : 0,

  // Fail fast in CI, run all locally
  forbidOnly: Boolean(process.env.CI),

  // Evidence collection on failure
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // baseURL is overridden per-spec via test.use({ baseURL }) in each fixture
    baseURL: "http://localhost:3000",
  },

  // Chromium-only
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // HTML report — 'never' auto-open so CI/Docker can serve it manually
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
});
