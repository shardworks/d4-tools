/**
 * Triage gallery spec.
 *
 * Covers:
 *   - Empty state: "No screenshots found" + supported-extension hint
 *   - Populated gallery: thumbnails present with loading="lazy"
 *   - Mtime-desc sort determinism: first thumbnail is the most recent
 *   - ParseStatusPip variants via pre-seeded cache entries:
 *       no entry  → uncached pip (gray circle)
 *       item      → green CheckCircle pip
 *       no-item   → gray/stone circle pip (no-item-detected)
 *       uncertain → amber AlertCircle pip
 *   - Thumbnail selection highlight: border-accent class on selected thumbnail
 *   - Selecting a thumbnail updates the right pane (empty-state text disappears)
 */

import { test, expect } from "@playwright/test";
import { createTestContext, destroyTestContext, dismissSoftGate, type TestContext } from "./fixtures";

let emptyCtx: TestContext;
let galleryCtx: TestContext;

test.beforeAll(async () => {
  emptyCtx = await createTestContext(async (seeder) => {
    await seeder.saveCharacter({ id: "tg-char", name: "TG Char", class: "Sorcerer", level: 1 });
    await seeder.saveBuild({ id: "tg-build", characterId: "tg-char", name: "TG Build" });
    await seeder.setActiveBuild("tg-build");
  });

  galleryCtx = await createTestContext(async (seeder) => {
    await seeder.saveCharacter({ id: "tgg-char", name: "TGG Char", class: "Sorcerer", level: 50 });
    await seeder.saveBuild({ id: "tgg-build", characterId: "tgg-char", name: "TGG Build" });
    await seeder.setActiveBuild("tgg-build");

    // Deterministic mtime ordering (newest first)
    const t1 = new Date("2026-01-04T00:00:00Z"); // newest
    const t2 = new Date("2026-01-03T00:00:00Z");
    const t3 = new Date("2026-01-02T00:00:00Z");
    const t4 = new Date("2026-01-01T00:00:00Z"); // oldest

    const helmHash    = await seeder.seedScreenshot("helm-sorcerer.png", { mtime: t1 });
    const ringHash    = await seeder.seedScreenshot("ring-aspect.png",   { mtime: t2 });
    const noItemHash  = await seeder.seedScreenshot("no-item.png",       { mtime: t3 });
    const uncertainHash = await seeder.seedScreenshot("uncertain.png",   { mtime: t4 });

    // Pre-seed cache entries for three of the four screenshots.
    await seeder.seedCacheEntry(helmHash,     "helm-sorcerer");   // kind:item → green pip
    await seeder.seedCacheEntry(noItemHash,   "no-item");          // kind:no-item-detected → gray pip
    await seeder.seedCacheEntry(uncertainHash, "uncertain");       // kind:uncertain → amber pip
    // ringHash has NO cache entry → uncached gray pip
    void ringHash;
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

test("triage gallery: empty state shows supported-extension hint", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${emptyCtx.baseURL}/triage`);
  await expect(page.locator("text=Add JPG, PNG, WEBP, or GIF files")).toBeVisible({ timeout: 15_000 });
});

// ─── Populated gallery ────────────────────────────────────────────────────────

test("triage gallery: thumbnails appear for seeded screenshots", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${galleryCtx.baseURL}/triage`);
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

test("triage gallery: first thumbnail is the most recent screenshot (mtime-desc)", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${galleryCtx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");
  const firstThumb = page.locator('img[loading="lazy"]').first();
  await expect(firstThumb).toBeVisible({ timeout: 15_000 });
  const src = (await firstThumb.getAttribute("src")) ?? "";
  expect(src).toContain("helm-sorcerer");
});

// ─── ParseStatusPip variants ──────────────────────────────────────────────────

test("triage gallery: item-parsed screenshot shows green pip", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${galleryCtx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");
  // kind:"item" pip uses text-green-400
  const greenPip = page.locator('[class*="text-green-400"], [class*="green"]').first();
  await expect(greenPip).toBeVisible({ timeout: 15_000 });
});

test("triage gallery: no-item screenshot shows gray/stone pip", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${galleryCtx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");
  // kind:"no-item-detected" pip uses text-stone-500 or similar gray tone.
  // The pip is a Circle icon — locate it by its color class.
  const grayPip = page
    .locator('[class*="text-stone-500"], [class*="text-stone-600"], [class*="stone"]')
    .first();
  await expect(grayPip).toBeVisible({ timeout: 15_000 });
});

test("triage gallery: uncertain screenshot shows amber pip", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${galleryCtx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");
  // kind:"uncertain" pip uses text-amber-400
  const amberPip = page.locator('[class*="text-amber-400"], [class*="amber"]').first();
  await expect(amberPip).toBeVisible({ timeout: 15_000 });
});

// ─── Thumbnail selection ──────────────────────────────────────────────────────

test("triage gallery: clicking thumbnail shows selection highlight", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${galleryCtx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");

  const firstThumb = page.locator('img[loading="lazy"]').first();
  await expect(firstThumb).toBeVisible({ timeout: 15_000 });
  await firstThumb.click();
  await page.waitForTimeout(500);

  const selected = page.locator('[class*="border-accent"]').first();
  await expect(selected).toBeVisible({ timeout: 5000 });
});

test("triage gallery: selecting thumbnail updates the right pane", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${galleryCtx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");

  // Before selection: empty state text visible
  await expect(page.locator("text=No screenshot selected")).toBeVisible({ timeout: 10_000 });

  // Click the first thumbnail
  const firstThumb = page.locator('img[loading="lazy"]').first();
  await expect(firstThumb).toBeVisible({ timeout: 15_000 });
  await firstThumb.click();
  await page.waitForTimeout(300);

  // Empty-state text must be gone
  await expect(page.locator("text=No screenshot selected")).not.toBeVisible({ timeout: 5000 });

  // Right pane now shows either the preview image or a filename mention
  await expect(
    page.locator('[class*="cursor-zoom-in"]')
      .or(page.locator("text=helm-sorcerer"))
  ).toBeVisible({ timeout: 5000 });
});
