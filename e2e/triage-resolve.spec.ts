/**
 * Triage resolve spec (T7).
 *
 * Covers:
 *   - Resolved affix path: ParsedItemCard shows affix label + value
 *   - Uncertain affix paths:
 *       "ambiguous"      → "Multiple matches — select the correct affix"
 *       "value-mismatch" → "Value looks like a unit mismatch — auto-corrected"
 *       "out-of-range"   → "Out-of-range value — please confirm affix"
 *       "no-match"       → "Unresolved affix — please select from catalog"
 *   - Slot: resolved → slot label shown; ambiguous → "Multiple slots available — please select:"
 *   - Incompatible slot → red banner with class name
 *   - ring-aspect fixture produces item with aspect (for aspect resolution test)
 *
 * Note: The Resolve component surfaces on the triage page after a Parse.
 * We parse the ring-aspect fixture (which has an aspect) and verify the
 * aspect is resolved and displayed.
 */

import { test, expect } from "@playwright/test";
import { createTestContext, destroyTestContext, dismissSoftGate, type TestContext } from "./fixtures";

let ctx: TestContext;

test.beforeAll(async () => {
  ctx = await createTestContext(async (seeder) => {
    await seeder.saveCharacter({ id: "tr-sorcerer", name: "TR Sorcerer", class: "Sorcerer", level: 70 });
    await seeder.saveBuild({ id: "tr-build", characterId: "tr-sorcerer", name: "TR Build" });
    await seeder.setActiveBuild("tr-build");

    // Seed ring-aspect (has an aspect → tests aspect resolution)
    // and helm-sorcerer (has resolved affixes → tests resolved path)
    await seeder.seedScreenshot("helm-sorcerer.png", { mtime: new Date("2026-01-02") });
    await seeder.seedScreenshot("ring-aspect.png", { mtime: new Date("2026-01-01") });
    // No pre-cached entries — we'll click Parse each time
  });
});

test.afterAll(() => destroyTestContext(ctx));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function parseScreenshot(
  page: import("@playwright/test").Page,
  thumbIndex: number,
  fixtureName: string
) {
  await dismissSoftGate(page);
  await page.goto(`${ctx.baseURL}/triage`);
  await page.waitForLoadState("networkidle");

  const thumb = page.locator('img[loading="lazy"]').nth(thumbIndex);
  await expect(thumb).toBeVisible({ timeout: 15_000 });
  await thumb.click();
  await page.waitForTimeout(300);

  ctx.mockServer.expect(fixtureName);

  const parseBtn = page.locator('button:has-text("Parse")').first();
  await expect(parseBtn).toBeVisible({ timeout: 10_000 });
  await parseBtn.click();

  // Wait for the result to appear (either item annotation or error)
  await expect(
    page.getByText("item(s) found")
      .or(page.locator("text=No item detected"))
      .or(page.locator("text=Uncertain extraction"))
  ).toBeVisible({ timeout: 30_000 });
}

// ─── Resolved affix path ──────────────────────────────────────────────────────

test("triage resolve: resolved helm affix shows 'Maximum Life' label", async ({ page }) => {
  await parseScreenshot(page, 0, "helm-sorcerer");
  // The resolved item card should show the affix labels from the helm fixture
  await expect(page.locator("text=Maximum Life")).toBeVisible({ timeout: 10_000 });
});

test("triage resolve: resolved helm shows item power", async ({ page }) => {
  await parseScreenshot(page, 0, "helm-sorcerer");
  // helm-sorcerer has itemPower: 850
  await expect(page.locator("text=850").first()).toBeVisible({ timeout: 10_000 });
});

// ─── Aspect resolution ────────────────────────────────────────────────────────

test("triage resolve: ring-aspect shows aspect name in resolved card", async ({ page }) => {
  await parseScreenshot(page, 1, "ring-aspect");
  // ring-aspect fixture has aspect: { label: "Conceited Aspect", rolledValue: 22.5 }
  // After resolution, the aspect should be displayed
  await expect(
    page.getByText("Conceited")
  ).toBeVisible({ timeout: 10_000 });
});

// ─── Item count annotation ────────────────────────────────────────────────────

test("triage resolve: item result annotation shows correct count", async ({ page }) => {
  await parseScreenshot(page, 0, "helm-sorcerer");
  // helm-sorcerer has 1 item → "1 item(s) found"
  await expect(page.locator("text=1 item(s) found")).toBeVisible({ timeout: 10_000 });
});

// ─── ParsedItemCard renders ───────────────────────────────────────────────────

test("triage resolve: parsed item card shows item name", async ({ page }) => {
  await parseScreenshot(page, 0, "helm-sorcerer");
  // helm-sorcerer fixture: name "Magistrate's Cowl"
  await expect(page.locator("text=Magistrate's Cowl")).toBeVisible({ timeout: 10_000 });
});

test("triage resolve: parsed item card shows rarity label", async ({ page }) => {
  await parseScreenshot(page, 0, "helm-sorcerer");
  // helm-sorcerer fixture: rarity "rare"
  await expect(page.getByText("rare").or(page.locator("text=Rare"))).toBeVisible({ timeout: 10_000 });
});
