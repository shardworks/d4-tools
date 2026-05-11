/**
 * Triage source-preview spec.
 *
 * Covers:
 *   - Empty pane shows "No screenshot selected"
 *   - After selecting a thumbnail: preview image has cursor-zoom-in styling
 *   - Click-to-lightbox: opens a Radix Dialog
 *   - Lightbox dismissal: Escape key closes it
 *   - Lightbox dismissal: clicking the backdrop overlay closes it
 *   - Selecting thumbnail updates the right pane (title / filename visible)
 */

import { test, expect } from "@playwright/test";
import { createTestContext, destroyTestContext, dismissSoftGate, type TestContext } from "./fixtures";

let ctx: TestContext;

test.beforeAll(async () => {
  ctx = await createTestContext(async (seeder) => {
    await seeder.saveCharacter({ id: "tsp-char", name: "TSP Char", class: "Sorcerer", level: 1 });
    await seeder.saveBuild({ id: "tsp-build", characterId: "tsp-char", name: "TSP Build" });
    await seeder.setActiveBuild("tsp-build");

    // Two screenshots so we can test selection changes
    await seeder.seedScreenshot("helm-sorcerer.png", { mtime: new Date("2026-01-02") });
    await seeder.seedScreenshot("ring-aspect.png", { mtime: new Date("2026-01-01") });
  });
});

test.afterAll(() => destroyTestContext(ctx));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function openLightbox(page: import("@playwright/test").Page) {
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
  return dialog;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("triage source preview: empty pane shows 'No screenshot selected'", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${ctx.baseURL}/triage`);
  await expect(page.locator("text=No screenshot selected")).toBeVisible({ timeout: 15_000 });
});

test("triage source preview: selecting thumbnail shows preview image", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${ctx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");

  const thumb = page.locator('img[loading="lazy"]').first();
  await expect(thumb).toBeVisible({ timeout: 15_000 });
  await thumb.click();

  const preview = page.locator('[class*="cursor-zoom-in"]').first();
  await expect(preview).toBeVisible({ timeout: 5000 });
});

test("triage source preview: selecting thumbnail updates right pane content", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${ctx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");

  // Before selection: "No screenshot selected"
  await expect(page.locator("text=No screenshot selected")).toBeVisible({ timeout: 10_000 });

  // Select first thumbnail (helm-sorcerer.png — newest mtime)
  const thumb = page.locator('img[loading="lazy"]').first();
  await thumb.click();
  await page.waitForTimeout(300);

  // Right pane should no longer show the empty-state text
  await expect(page.locator("text=No screenshot selected")).not.toBeVisible({ timeout: 5000 });

  // The filename or a preview image should be visible in the right pane
  await expect(
    page.locator("text=helm-sorcerer").or(page.locator('[class*="cursor-zoom-in"]'))
  ).toBeVisible({ timeout: 5000 });
});

test("triage source preview: clicking preview image opens lightbox dialog", async ({ page }) => {
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
});

test("triage source preview: Escape closes the lightbox", async ({ page }) => {
  const dialog = await openLightbox(page);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible({ timeout: 3000 });
});

test("triage source preview: clicking the backdrop overlay closes the lightbox", async ({ page }) => {
  const dialog = await openLightbox(page);

  // Radix Dialog backdrop: the overlay element is outside the dialog content.
  // Clicking the backdrop (outside the dialog's content box) dismisses it.
  // Strategy: click at the very edge of the viewport (outside the dialog content).
  await page.mouse.click(1, 1);

  await expect(dialog).not.toBeVisible({ timeout: 5000 });
});
