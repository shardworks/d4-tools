/**
 * Builds list spec (T4).
 *
 * Covers:
 *   - Empty state: "No builds yet." literal
 *   - Populated state: row with character name, level, class, build name
 *   - Row click navigates to /builds/<id>
 *   - Edit cell link navigates to /characters/<characterId> (NOT /builds/<id>) — D3 disambiguation
 *   - Header CTA "New Character" links to /characters/new
 *   - Error banner: corrupted-JSON build file surfaces amber/red banner (D25)
 */

import { test, expect } from "@playwright/test";
import { createTestContext, destroyTestContext, dismissSoftGate, type TestContext } from "./fixtures";

// ─── Empty-state context ─────────────────────────────────────────────────────

let emptyCtx: TestContext;
let populatedCtx: TestContext;
let errorCtx: TestContext;

test.beforeAll(async () => {
  // This hook starts three next dev servers; give it 5 minutes.
  test.setTimeout(300_000);

  // Empty state — no builds seeded
  emptyCtx = await createTestContext();

  // Populated state — one character + one build
  populatedCtx = await createTestContext(async (seeder) => {
    await seeder.saveCharacter({
      id: "bl-sorcerer",
      name: "BL Sorcerer",
      class: "Sorcerer",
      level: 75,
    });
    await seeder.saveBuild({
      id: "bl-build",
      characterId: "bl-sorcerer",
      name: "BL Build",
    });
  });

  // Error state — one valid build and one corrupt JSON build (D25)
  errorCtx = await createTestContext(async (seeder) => {
    await seeder.saveCharacter({
      id: "err-char",
      name: "Error Char",
      class: "Sorcerer",
      level: 1,
    });
    await seeder.saveBuild({
      id: "good-build",
      characterId: "err-char",
      name: "Good Build",
    });
    // Write a corrupt JSON file for another build — triggers listBuilds() parse failure
    await seeder.writeRawBuildFile("corrupt-build", "{ not valid json !!!");
  });
});

test.afterAll(async () => {
  await Promise.all([
    destroyTestContext(emptyCtx),
    destroyTestContext(populatedCtx),
    destroyTestContext(errorCtx),
  ]);
});

// ─── Empty state ─────────────────────────────────────────────────────────────

test("builds list: shows 'No builds yet.' when no builds exist", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${emptyCtx.baseURL}/builds`);
  await expect(page.locator("text=No builds yet.")).toBeVisible({ timeout: 10_000 });
});

test("builds list: 'New Character' CTA links to /characters/new", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${emptyCtx.baseURL}/builds`);
  const cta = page.locator('a[href="/characters/new"]').first();
  await expect(cta).toBeVisible({ timeout: 10_000 });
});

// ─── Populated state ─────────────────────────────────────────────────────────

test("builds list: shows character + build info in row", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${populatedCtx.baseURL}/builds`);
  await expect(page.locator("text=BL Sorcerer")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("text=BL Build")).toBeVisible();
  // Use exact match to avoid matching "BL Sorcerer" as well
  await expect(page.getByText("Sorcerer", { exact: true })).toBeVisible();
});

test("builds list: row click navigates to /builds/<id>", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${populatedCtx.baseURL}/builds`);
  await page.waitForLoadState("networkidle");

  // The row has a Link wrapping data cells (display:contents)
  // Click on the character name cell which is inside the row link
  const charName = page.locator("text=BL Sorcerer").first();
  await expect(charName).toBeVisible({ timeout: 15_000 });
  await charName.click();

  await page.waitForURL(/\/builds\/bl-build/, { timeout: 10_000 });
  expect(page.url()).toContain("/builds/bl-build");
});

test("builds list: Edit cell link navigates to /characters/<characterId>", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${populatedCtx.baseURL}/builds`);
  await page.waitForLoadState("networkidle");

  // The Edit cell is a sibling Link to /characters/<characterId>
  const editLink = page.locator('a[href="/characters/bl-sorcerer"]');
  await expect(editLink).toBeVisible({ timeout: 15_000 });
  // Click and verify navigation
  await editLink.click();
  await page.waitForURL(/\/characters\/bl-sorcerer/, { timeout: 10_000 });
  expect(page.url()).toContain("/characters/bl-sorcerer");
});

// ─── Error state (D25) ───────────────────────────────────────────────────────

test("builds list: corrupted build JSON surfaces error banner (D25)", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${errorCtx.baseURL}/builds`);
  // When listBuilds() throws on parse, the page renders an error banner
  // The banner has class error-banner font-mono whitespace-pre-wrap
  const errorBanner = page.locator(".error-banner, [class*='error-banner']").first();
  await expect(errorBanner).toBeVisible({ timeout: 15_000 });
});
