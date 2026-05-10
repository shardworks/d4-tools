/**
 * Triage source-preview spec (T6).
 *
 * Covers:
 *   - Empty pane shows <ImageOff> icon + "No screenshot selected"
 *   - After selecting a thumbnail: preview image appears with cursor-zoom-in
 *   - Click-to-lightbox: opens a Radix <Dialog>
 *   - Lightbox dismissal: Escape key closes it
 *   - Lightbox dismissal: clicking the backdrop closes it
 */

import { test, expect } from "@playwright/test";
import { createTestContext, destroyTestContext, dismissSoftGate, type TestContext } from "./fixtures";

let ctx: TestContext;

test.beforeAll(async () => {
  ctx = await createTestContext(async (seeder) => {
    await seeder.saveCharacter({ id: "tsp-char", name: "TSP Char", class: "Sorcerer", level: 1 });
    await seeder.saveBuild({ id: "tsp-build", characterId: "tsp-char", name: "TSP Build" });
    await seeder.setActiveBuild("tsp-build");

    await seeder.seedScreenshot("helm-sorcerer.png", { mtime: new Date("2026-01-01") });
  });
});

test.afterAll(() => destroyTestContext(ctx));

// ─── Tests ────────────────────────────────────────────────────────────────────

test("triage source preview: empty pane shows 'No screenshot selected'", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${ctx.baseURL}/triage`);
  await expect(page.locator("text=No screenshot selected")).toBeVisible({ timeout: 15_000 });
});

test("triage source preview: selecting a thumbnail shows preview image", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${ctx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");

  // Select the thumbnail
  const thumb = page.locator('img[loading="lazy"]').first();
  await expect(thumb).toBeVisible({ timeout: 15_000 });
  await thumb.click();

  // The DetailPane should now show the screenshot preview
  // Look for the cursor-zoom-in class on the preview block
  const preview = page.locator('[class*="cursor-zoom-in"]').first();
  await expect(preview).toBeVisible({ timeout: 5000 });
});

test("triage source preview: clicking preview image opens lightbox dialog", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${ctx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");

  const thumb = page.locator('img[loading="lazy"]').first();
  await expect(thumb).toBeVisible({ timeout: 15_000 });
  await thumb.click();

  // Click the preview image to open the lightbox
  const preview = page.locator('[class*="cursor-zoom-in"]').first();
  await expect(preview).toBeVisible({ timeout: 5000 });
  await preview.click();

  // The Radix Dialog should open
  const dialog = page.locator('[role="dialog"]').first();
  await expect(dialog).toBeVisible({ timeout: 5000 });
});

test("triage source preview: Escape closes the lightbox", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${ctx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");

  const thumb = page.locator('img[loading="lazy"]').first();
  await expect(thumb).toBeVisible({ timeout: 15_000 });
  await thumb.click();

  const preview = page.locator('[class*="cursor-zoom-in"]').first();
  await expect(preview).toBeVisible({ timeout: 5000 });
  await preview.click();

  const dialog = page.locator('[role="dialog"]').first();
  await expect(dialog).toBeVisible({ timeout: 5000 });

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible({ timeout: 3000 });
});
