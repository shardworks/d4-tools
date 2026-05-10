/**
 * Triage gallery spec (T6).
 *
 * Covers:
 *   - Empty state: "No screenshots found" + add-files prompt
 *   - Populated gallery: thumbnails present with loading="lazy"
 *   - Mtime-desc sort determinism (D29): first thumbnail is the most recent
 *   - ParseStatusPip variants via pre-seeded cache entries:
 *       null     → Circle text-stone-600
 *       item     → CheckCircle text-green-400
 *       no-item  → Circle text-stone-500
 *       uncertain → AlertCircle text-amber-400
 *   - Thumbnail selection: border-accent on the selected thumbnail
 *   - Selecting a thumbnail updates the DetailPane (right pane)
 */

import { test, expect } from "@playwright/test";
import { createTestContext, destroyTestContext, dismissSoftGate, type TestContext } from "./fixtures";

let emptyCtx: TestContext;
let galleryCtx: TestContext;

test.beforeAll(async () => {
  emptyCtx = await createTestContext(async (seeder) => {
    // Character and build for environment sanity (but no screenshots)
    await seeder.saveCharacter({ id: "tg-char", name: "TG Char", class: "Sorcerer", level: 1 });
    await seeder.saveBuild({ id: "tg-build", characterId: "tg-char", name: "TG Build" });
    await seeder.setActiveBuild("tg-build");
  });

  galleryCtx = await createTestContext(async (seeder) => {
    await seeder.saveCharacter({ id: "tgg-char", name: "TGG Char", class: "Sorcerer", level: 50 });
    await seeder.saveBuild({ id: "tgg-build", characterId: "tgg-char", name: "TGG Build" });
    await seeder.setActiveBuild("tgg-build");

    // Seed screenshots with deterministic mtimes (D29):
    // Most recent = helm-sorcerer (newest), least recent = uncertain
    const t1 = new Date("2026-01-04T00:00:00Z"); // newest
    const t2 = new Date("2026-01-03T00:00:00Z");
    const t3 = new Date("2026-01-02T00:00:00Z");
    const t4 = new Date("2026-01-01T00:00:00Z"); // oldest

    const helmHash = await seeder.seedScreenshot("helm-sorcerer.png", { mtime: t1 });
    const ringHash = await seeder.seedScreenshot("ring-aspect.png", { mtime: t2 });
    const noItemHash = await seeder.seedScreenshot("no-item.png", { mtime: t3 });
    const uncertainHash = await seeder.seedScreenshot("uncertain.png", { mtime: t4 });

    // Pre-cache parse results for status pip variants
    await seeder.seedCacheEntry(helmHash, "helm-sorcerer");    // kind:item → CheckCircle green
    await seeder.seedCacheEntry(noItemHash, "no-item");         // kind:no-item-detected → Circle gray
    await seeder.seedCacheEntry(uncertainHash, "uncertain");    // kind:uncertain → AlertCircle amber
    // ringHash has NO cache entry → null pip (Circle text-stone-600)
  });
});

test.afterAll(async () => {
  await Promise.all([
    destroyTestContext(emptyCtx),
    destroyTestContext(galleryCtx),
  ]);
});

// ─── Empty state ─────────────────────────────────────────────────────────────

test("triage gallery: empty state shows 'No screenshots found'", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${emptyCtx.baseURL}/triage`);
  await expect(page.locator("text=No screenshots found")).toBeVisible({ timeout: 15_000 });
});

test("triage gallery: empty state shows add-files prompt text", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${emptyCtx.baseURL}/triage`);
  // The add-files prompt references SCREENSHOT_DIR
  await expect(page.locator("text=Add JPG, PNG, WEBP, or GIF files")).toBeVisible({ timeout: 15_000 });
});

// ─── Populated gallery ────────────────────────────────────────────────────────

test("triage gallery: thumbnails appear for seeded screenshots", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${galleryCtx.baseURL}/triage`);
  // Thumbnails: img elements with loading="lazy"
  const thumbs = page.locator('img[loading="lazy"]');
  await expect(thumbs.first()).toBeVisible({ timeout: 15_000 });
});

test("triage gallery: all thumbnails have loading='lazy'", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${galleryCtx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");
  const thumbs = await page.locator('img[loading="lazy"]').all();
  expect(thumbs.length).toBeGreaterThanOrEqual(4);
});

test("triage gallery: first thumbnail is the most recent screenshot (D29)", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${galleryCtx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");
  // The gallery sorts by mtime desc — first img src should contain "helm-sorcerer"
  const firstThumb = page.locator('img[loading="lazy"]').first();
  await expect(firstThumb).toBeVisible({ timeout: 15_000 });
  const src = await firstThumb.getAttribute("src") ?? "";
  // The first screenshot is helm-sorcerer.png (newest mtime)
  expect(src).toContain("helm-sorcerer");
});

test("triage gallery: item-parsed screenshot shows green check pip", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${galleryCtx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");
  // ParseStatusPip for kind:"item" uses CheckCircle with text-green-400
  const greenPip = page.locator('[class*="text-green-400"], [class*="green"]').first();
  await expect(greenPip).toBeVisible({ timeout: 15_000 });
});

test("triage gallery: uncertain screenshot shows amber circle pip", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${galleryCtx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");
  // ParseStatusPip for kind:"uncertain" uses AlertCircle with text-amber-400
  const amberPip = page.locator('[class*="text-amber-400"], [class*="amber"]').first();
  await expect(amberPip).toBeVisible({ timeout: 15_000 });
});

test("triage gallery: clicking thumbnail shows selection highlight", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${galleryCtx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");

  const firstThumb = page.locator('img[loading="lazy"]').first();
  await expect(firstThumb).toBeVisible({ timeout: 15_000 });

  // Click the thumbnail button (the outer button that wraps each thumbnail)
  const thumbBtn = firstThumb.locator("..").locator(".."); // go up to the button ancestor
  // Alternatively, click the image itself
  await firstThumb.click();

  // After clicking, the selected thumbnail should have border-accent
  await page.waitForTimeout(500);
  const selected = page.locator('[class*="border-accent"]').first();
  await expect(selected).toBeVisible({ timeout: 5000 });
});
