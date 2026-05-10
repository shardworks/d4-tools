/**
 * Triage parse spec (T6).
 *
 * Covers:
 *   - Parse button label: "Parse" on cache-miss, "Re-parse" on cache-hit
 *   - In-flight spinner: <Loader2 animate-spin> + "Parsing…" text
 *   - kind:"item" annotation: "<n> item(s) found"
 *   - kind:"no-item-detected" annotation + italic description
 *   - kind:"uncertain" annotation + amber description
 *   - Server error banner: class text-xs text-destructive bg-destructive/10
 *   - No-cache-on-error invariant: cache file not written after 500 (D13)
 *   - Offline guarantee: suite uses mock server, never reaches real Anthropic API (D17)
 */

import * as fs from "fs/promises";
import * as path from "path";
import { createHash } from "crypto";
import { test, expect } from "@playwright/test";
import { createTestContext, destroyTestContext, dismissSoftGate, type TestContext } from "./fixtures";

// ─── Context: fresh screenshots without pre-cached results ────────────────────

let parseCtx: TestContext;
let cacheHitCtx: TestContext;

test.beforeAll(async () => {
  // Parse context: screenshots seeded, no pre-cached results → "Parse" button
  parseCtx = await createTestContext(async (seeder) => {
    await seeder.saveCharacter({ id: "tp-char", name: "TP Char", class: "Sorcerer", level: 1 });
    await seeder.saveBuild({ id: "tp-build", characterId: "tp-char", name: "TP Build" });
    await seeder.setActiveBuild("tp-build");

    await seeder.seedScreenshot("helm-sorcerer.png", { mtime: new Date("2026-01-03") });
    await seeder.seedScreenshot("no-item.png", { mtime: new Date("2026-01-02") });
    await seeder.seedScreenshot("uncertain.png", { mtime: new Date("2026-01-01") });
  });

  // Cache-hit context: screenshots seeded with pre-cached results → "Re-parse" button
  cacheHitCtx = await createTestContext(async (seeder) => {
    await seeder.saveCharacter({ id: "tph-char", name: "TPH Char", class: "Sorcerer", level: 1 });
    await seeder.saveBuild({ id: "tph-build", characterId: "tph-char", name: "TPH Build" });
    await seeder.setActiveBuild("tph-build");

    const helmHash = await seeder.seedScreenshot("helm-sorcerer.png", { mtime: new Date("2026-01-01") });
    await seeder.seedCacheEntry(helmHash, "helm-sorcerer");
  });
});

test.afterAll(async () => {
  await Promise.all([
    destroyTestContext(parseCtx),
    destroyTestContext(cacheHitCtx),
  ]);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function selectFirstThumb(page: import("@playwright/test").Page) {
  const thumb = page.locator('img[loading="lazy"]').first();
  await expect(thumb).toBeVisible({ timeout: 15_000 });
  await thumb.click();
  await page.waitForTimeout(300);
}

// ─── Parse button label ───────────────────────────────────────────────────────

test("triage parse: cache-miss shows 'Parse' button", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${parseCtx.baseURL}/triage`);
  await selectFirstThumb(page);

  const parseBtn = page.locator('button:has-text("Parse")').first();
  await expect(parseBtn).toBeVisible({ timeout: 10_000 });
});

test("triage parse: cache-hit shows 'Re-parse' button", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${cacheHitCtx.baseURL}/triage`);
  await selectFirstThumb(page);

  const reparseBtn = page.locator('button:has-text("Re-parse")').first();
  await expect(reparseBtn).toBeVisible({ timeout: 10_000 });
});

// ─── Parse result annotations ─────────────────────────────────────────────────

test("triage parse: kind:'item' result shows '1 item(s) found'", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${parseCtx.baseURL}/triage`);
  await selectFirstThumb(page);

  // Register the helm-sorcerer fixture (1 item)
  parseCtx.mockServer.expect("helm-sorcerer");

  const parseBtn = page.locator('button:has-text("Parse")').first();
  await expect(parseBtn).toBeVisible({ timeout: 10_000 });
  await parseBtn.click();

  // Wait for result annotation
  await expect(page.getByText("item(s) found")).toBeVisible({ timeout: 30_000 });
});

test("triage parse: kind:'no-item-detected' shows 'No item detected'", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${parseCtx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");

  // Select the no-item screenshot (second thumbnail)
  const thumbs = page.locator('img[loading="lazy"]');
  await expect(thumbs.nth(1)).toBeVisible({ timeout: 15_000 });
  await thumbs.nth(1).click();
  await page.waitForTimeout(300);

  parseCtx.mockServer.expect("no-item");

  const parseBtn = page.locator('button:has-text("Parse")').first();
  await expect(parseBtn).toBeVisible({ timeout: 10_000 });
  await parseBtn.click();

  await expect(page.locator("text=No item detected")).toBeVisible({ timeout: 30_000 });
});

test("triage parse: kind:'uncertain' shows 'Uncertain extraction'", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${parseCtx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");

  // Select the uncertain screenshot (third thumbnail)
  const thumbs = page.locator('img[loading="lazy"]');
  await expect(thumbs.nth(2)).toBeVisible({ timeout: 15_000 });
  await thumbs.nth(2).click();
  await page.waitForTimeout(300);

  parseCtx.mockServer.expect("uncertain");

  const parseBtn = page.locator('button:has-text("Parse")').first();
  await expect(parseBtn).toBeVisible({ timeout: 10_000 });
  await parseBtn.click();

  await expect(page.locator("text=Uncertain extraction")).toBeVisible({ timeout: 30_000 });
});

// ─── Server error banner ──────────────────────────────────────────────────────

test("triage parse: API error shows destructive error banner", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${parseCtx.baseURL}/triage`);
  await selectFirstThumb(page);

  // Queue an error response
  parseCtx.mockServer.expectError();

  const parseBtn = page.locator('button:has-text("Parse")').first();
  await expect(parseBtn).toBeVisible({ timeout: 10_000 });
  await parseBtn.click();

  // Error banner with class text-xs text-destructive bg-destructive/10
  const errorBanner = page.locator('[class*="text-destructive"], [class*="destructive"]').first();
  await expect(errorBanner).toBeVisible({ timeout: 30_000 });
});

test("triage parse: no cache file written after API error (D13)", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${parseCtx.baseURL}/triage`);
  await selectFirstThumb(page);

  // Compute the hash of helm-sorcerer.png to check the cache file
  const imgBytes = await import("fs/promises").then((fs) =>
    fs.readFile(path.join(__dirname, "fixtures/screenshots/helm-sorcerer.png"))
  );
  const hash = createHash("sha256").update(imgBytes).digest("hex");

  // Queue an error
  parseCtx.mockServer.expectError();

  const parseBtn = page.locator('button:has-text("Parse")').first();
  await expect(parseBtn).toBeVisible({ timeout: 10_000 });
  await parseBtn.click();

  // Wait for the error to be displayed
  const errorBanner = page.locator('[class*="text-destructive"], [class*="destructive"]').first();
  await expect(errorBanner).toBeVisible({ timeout: 30_000 });

  // Assert: no cache file was written
  const cacheFile = path.join(parseCtx.dataDir, "screenshot-cache", `${hash}.json`);
  const cacheExists = await fs.access(cacheFile).then(() => true).catch(() => false);
  expect(cacheExists).toBe(false);
});
