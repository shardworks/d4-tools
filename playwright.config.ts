/**
 * Playwright configuration for d4-tools end-to-end tests.
 *
 * Run modes:
 *   pnpm test:e2e              — headless local/CI run (webServer auto-started)
 *   pnpm e2e:ui                — Docker-based remote-monitor UI run (see docker-compose.e2e.yml)
 *   PLAYWRIGHT_NO_WEBSERVER=1  — skip the built-in webServer block (UI mode uses its own server)
 *
 * Per-spec server lifecycle: each spec boots its own next dev on a unique port via the
 * fixture in e2e/fixtures/index.ts; the webServer block here is only for global
 * availability checks — the baseURL is overridden per-spec by test.use().
 */

import { defineConfig, devices } from "@playwright/test";

const workers = process.env.PLAYWRIGHT_WORKERS
  ? parseInt(process.env.PLAYWRIGHT_WORKERS, 10)
  : 2;

const noWebServer = Boolean(process.env.PLAYWRIGHT_NO_WEBSERVER);

export default defineConfig({
  // Spec files live under e2e/ with .spec.ts suffix — naturally outside vitest's *.test.ts glob
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

  // Chromium-only (D2)
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // HTML report — 'never' auto-open so CI/Docker can serve it manually
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],

  // webServer block: starts next dev for local/CI runs; skipped in UI mode
  ...(noWebServer
    ? {}
    : {
        webServer: {
          command: "pnpm dev",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            DATA_DIR: "./data",
            SCREENSHOT_DIR: "./screenshots",
            ANTHROPIC_API_KEY: "test-key-not-real",
          },
        },
      }),
});
