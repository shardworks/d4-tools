/**
 * Build detail spec (T4).
 *
 * Covers:
 *   - <h1> contains the character name
 *   - Build name shown as accent sub-line
 *   - Chip line with class and level
 *   - Gear slot grid present (empty slots with dashed border)
 *   - 404 for unknown build ID
 *   - Corrupted build file → "Error loading build:" banner
 *   - Config gap → amber "Config gap:" banner (D26)
 */

import { test, expect } from "@playwright/test";
import { createTestContext, destroyTestContext, dismissSoftGate, type TestContext } from "./fixtures";

let normalCtx: TestContext;
let corruptCtx: TestContext;
let configGapCtx: TestContext;

test.beforeAll(async () => {
  // Extend the hook timeout to 5 minutes; servers start in parallel so wall-clock
  // time is roughly one server's startup time, not three.
  test.setTimeout(300_000);

  [normalCtx, corruptCtx, configGapCtx] = await Promise.all([
    createTestContext(async (seeder) => {
      await seeder.saveCharacter({
        id: "bd-sorcerer",
        name: "BD Sorcerer",
        class: "Sorcerer",
        level: 50,
      });
      await seeder.saveBuild({
        id: "bd-build",
        characterId: "bd-sorcerer",
        name: "BD Build",
      });
      await seeder.setActiveBuild("bd-build");
    }),

    createTestContext(async (seeder) => {
      await seeder.saveCharacter({
        id: "corrupt-char",
        name: "Corrupt Char",
        class: "Sorcerer",
        level: 1,
      });
      await seeder.writeRawBuildFile("corrupt-bd", "{ not valid json !!!");
    }),

    createTestContext(async (seeder) => {
      await seeder.saveCharacter({
        id: "gap-sorcerer",
        name: "Gap Sorcerer",
        class: "Sorcerer",
        level: 100,
        // Equip a helm with affix_max_life so the damage engine looks up Attr_Max_Life.
        // The writeDamageConfigOverride below nulls that key, triggering the config-gap throw.
        equippedItems: {
          helm: {
            slot: "helm",
            name: "Test Helm",
            rarity: "rare",
            explicits: [{ affixId: "affix_max_life", rolledValue: 500 }],
          },
        },
      });
      await seeder.saveBuild({
        id: "gap-build",
        characterId: "gap-sorcerer",
        name: "Gap Build",
      });
      await seeder.setActiveBuild("gap-build");
      // Remove Attr_Max_Life from damage config so DPS calculation hits a config gap
      await seeder.writeDamageConfigOverride({ attributeToBucket: { Attr_Max_Life: null } });
    }),
  ]);
});

test.afterAll(async () => {
  await Promise.all([
    normalCtx ? destroyTestContext(normalCtx) : Promise.resolve(),
    corruptCtx ? destroyTestContext(corruptCtx) : Promise.resolve(),
    configGapCtx ? destroyTestContext(configGapCtx) : Promise.resolve(),
  ]);
});

// ─── Normal build ─────────────────────────────────────────────────────────────

test("build detail: <h1> shows character name", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${normalCtx.baseURL}/builds/bd-build`);
  const h1 = page.locator("h1");
  await expect(h1).toContainText("BD Sorcerer", { timeout: 15_000 });
});

test("build detail: build name shown as accent sub-line", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${normalCtx.baseURL}/builds/bd-build`);
  // Build name appears in both sidebar and main — scope to main to avoid strict mode violation
  await expect(page.locator("main").getByText("BD Build").first()).toBeVisible({ timeout: 15_000 });
});

test("build detail: chip line shows class and level", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${normalCtx.baseURL}/builds/bd-build`);
  await page.waitForLoadState("networkidle");
  const main = page.locator("main");
  await expect(main.locator("text=Sorcerer").first()).toBeVisible({ timeout: 15_000 });
  // BuildSummaryView renders "Level {level}" (not "Lvl")
  await expect(main.locator("text=Level 50").first()).toBeVisible();
});

test("build detail: Sorcerer shows gear slots", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${normalCtx.baseURL}/builds/bd-build`);
  await page.waitForLoadState("networkidle");
  // Empty gear slots render with border-dashed class
  const emptySlot = page.locator('[class*="border-dashed"]').first();
  await expect(emptySlot).toBeVisible({ timeout: 15_000 });
});

test("build detail: empty slots have dashed border styling", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${normalCtx.baseURL}/builds/bd-build`);
  await page.waitForLoadState("networkidle");
  // At least one empty slot indicator should exist for a build with no equipped items
  const emptySlots = page.locator('[class*="border-dashed"]');
  await expect(emptySlots.first()).toBeVisible({ timeout: 15_000 });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────

test("build detail: non-existent ID returns 404 page", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${normalCtx.baseURL}/builds/does-not-exist`);
  // Next.js notFound() renders a 404 page
  const body = await page.content();
  expect(body).toMatch(/404|not found/i);
});

// ─── Corrupt build (inline banner) ───────────────────────────────────────────

test("build detail: corrupted build file shows 'Error loading build:' banner", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${corruptCtx.baseURL}/builds/corrupt-bd`);
  // The page returns 200 with an inline destructive banner
  await expect(page.locator("text=Error loading build:")).toBeVisible({ timeout: 15_000 });
});

// ─── Config gap (D26) ────────────────────────────────────────────────────────

test("build detail: config gap shows amber 'Config gap:' banner (D26)", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${configGapCtx.baseURL}/builds/gap-build`);
  await page.waitForLoadState("networkidle");
  // The build summary shows "Config gap: <error message>" when DPS calc throws
  await expect(page.locator("text=Config gap:")).toBeVisible({ timeout: 15_000 });
});
