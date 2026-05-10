/**
 * Triage crop-view spec (T6).
 *
 * Covers:
 *   - "Sent to LLM:" heading in DetailPane when a parsed screenshot is selected
 *   - Single crop tile (alt text "Crop 1 of 1") for a single-item screenshot
 *   - "no tooltip detected; full image sent to LLM" when no tooltip was detected
 *   - Click-to-lightbox for the crop tile
 *
 * The crop metadata is fetched from GET /api/triage/cropped/<hash>?filename=...
 * which returns { count, detected } based on the sharp-cropped image.
 * We use pre-parsed screenshots so the crop data is available without calling
 * the real Anthropic API.
 */

import { test, expect } from "@playwright/test";
import { createTestContext, destroyTestContext, dismissSoftGate, type TestContext } from "./fixtures";

let ctx: TestContext;

test.beforeAll(async () => {
  ctx = await createTestContext(async (seeder) => {
    await seeder.saveCharacter({ id: "tcv-char", name: "TCV Char", class: "Sorcerer", level: 1 });
    await seeder.saveBuild({ id: "tcv-build", characterId: "tcv-char", name: "TCV Build" });
    await seeder.setActiveBuild("tcv-build");

    // Seed a screenshot with a pre-parsed cache entry (helmet → detected)
    const helmHash = await seeder.seedScreenshot("helm-sorcerer.png", { mtime: new Date("2026-01-02") });
    await seeder.seedCacheEntry(helmHash, "helm-sorcerer");

    // Seed a screenshot with no-item cache entry (no crop detected)
    const noItemHash = await seeder.seedScreenshot("no-item.png", { mtime: new Date("2026-01-01") });
    await seeder.seedCacheEntry(noItemHash, "no-item");
  });
});

test.afterAll(() => destroyTestContext(ctx));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function goToTriageAndSelectThumb(
  page: import("@playwright/test").Page,
  index = 0
) {
  await dismissSoftGate(page);
  await page.goto(`${ctx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");

  const thumb = page.locator('img[loading="lazy"]').nth(index);
  await expect(thumb).toBeVisible({ timeout: 15_000 });
  await thumb.click();
  await page.waitForTimeout(500);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("triage crop view: 'Sent to LLM:' heading visible when screenshot is selected", async ({ page }) => {
  await goToTriageAndSelectThumb(page, 0);
  await expect(page.locator("text=Sent to LLM:")).toBeVisible({ timeout: 10_000 });
});

test("triage crop view: crop tile shown for detected item", async ({ page }) => {
  await goToTriageAndSelectThumb(page, 0); // helm-sorcerer (detected)
  // Should show at least one crop tile
  const cropTile = page.locator('img[alt*="Crop"]').first();
  await expect(cropTile).toBeVisible({ timeout: 10_000 });
  const alt = await cropTile.getAttribute("alt") ?? "";
  expect(alt).toMatch(/Crop \d+ of \d+/);
});

test("triage crop view: no-item screenshot shows full-image fallback label", async ({ page }) => {
  await goToTriageAndSelectThumb(page, 1); // no-item.png
  // Should show "no tooltip detected; full image sent to LLM"
  await expect(
    page.getByText("no tooltip detected; full image sent to LLM")
  ).toBeVisible({ timeout: 10_000 });
});

test("triage crop view: clicking crop tile opens lightbox", async ({ page }) => {
  await goToTriageAndSelectThumb(page, 0); // helm-sorcerer (detected)
  const cropTile = page.locator('img[alt*="Crop"]').first();
  await expect(cropTile).toBeVisible({ timeout: 10_000 });
  await cropTile.click();
  // Lightbox opens as a Radix Dialog
  const dialog = page.locator('[role="dialog"]').first();
  await expect(dialog).toBeVisible({ timeout: 5000 });
  // Close with Escape
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible({ timeout: 3000 });
});
