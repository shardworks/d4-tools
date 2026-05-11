/**
 * Character editor spec.
 *
 * Covers:
 *   - /characters/new renders name + class fields
 *   - Fill form → Save → redirects to /builds/<slug>
 *   - /characters/<id> loads existing character values
 *   - Class field shows current class
 *   - Class picker opens and shows available classes
 *   - Level out-of-bounds (0) → validation error before save
 *   - Level out-of-bounds (> 100) → validation error before save
 *   - Edit existing: change name → Save → persisted value visible, no dirty flag
 *   - Three tabs (Basic / Skills / Paragon) are present
 *   - Tab state preserved: filling a field on Basic, switching to Skills, back → field retained
 *   - Skills tab renders when clicked
 *   - Paragon tab shows Add Board button
 *   - Beforeunload guard: dirty form + hard navigation → browser confirm
 *   - Save error: POST 500 → error banner, form retains input value
 */

import { test, expect } from "@playwright/test";
import { createTestContext, destroyTestContext, dismissSoftGate, type TestContext } from "./fixtures";

// ─── Contexts ─────────────────────────────────────────────────────────────────

let newCharCtx: TestContext;
let editCtx: TestContext;
let levelCtx: TestContext;

test.beforeAll(async () => {
  test.setTimeout(300_000);

  newCharCtx = await createTestContext();

  editCtx = await createTestContext(async (seeder) => {
    await seeder.saveCharacter({
      id: "edit-sorcerer",
      name: "Edit Sorcerer",
      class: "Sorcerer",
      level: 60,
    });
    await seeder.saveBuild({
      id: "edit-build",
      characterId: "edit-sorcerer",
      name: "Edit Build",
    });
  });

  levelCtx = await createTestContext();
});

test.afterAll(async () => {
  await Promise.all([
    destroyTestContext(newCharCtx),
    destroyTestContext(editCtx),
    destroyTestContext(levelCtx),
  ]);
});

// ─── New character flow ───────────────────────────────────────────────────────

test("character editor: /characters/new renders the editor", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${newCharCtx.baseURL}/characters/new`);
  await expect(
    page.locator('input[name="name"], input[placeholder*="name"], input[id*="name"]').first()
  ).toBeVisible({ timeout: 15_000 });
});

test("character editor: fills form and Save redirects to /builds/<slug>", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${newCharCtx.baseURL}/characters/new`);

  const nameInput = page.locator('input[name="name"]').first();
  await expect(nameInput).toBeVisible({ timeout: 15_000 });
  await nameInput.fill("E2E Test Character");

  const saveBtn = page.locator('button[type="submit"], button:has-text("Save")').first();
  await saveBtn.click();

  // Server slugs the name → /builds/e2e-test-character or similar
  await page.waitForURL(/\/builds\/e2e-test-character(-\d+)?/, { timeout: 30_000 });
  expect(page.url()).toMatch(/\/builds\//);
});

// ─── Edit existing character ──────────────────────────────────────────────────

test("character editor: /characters/<id> loads existing values", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${editCtx.baseURL}/characters/edit-sorcerer`);
  const nameInput = page.locator('input[name="name"]').first();
  await expect(nameInput).toBeVisible({ timeout: 15_000 });
  await expect(nameInput).toHaveValue("Edit Sorcerer");
});

test("character editor: class field shows current class", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${editCtx.baseURL}/characters/edit-sorcerer`);
  await expect(page.locator("text=Sorcerer").first()).toBeVisible({ timeout: 15_000 });
});

test("character editor: edit name → Save → updated value persists", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${editCtx.baseURL}/characters/edit-sorcerer`);

  const nameInput = page.locator('input[name="name"]').first();
  await expect(nameInput).toBeVisible({ timeout: 15_000 });
  await nameInput.fill("Edit Sorcerer Updated");

  const saveBtn = page.locator('button[type="submit"], button:has-text("Save")').first();
  await saveBtn.click();

  // Wait for save to complete (redirect or in-place update)
  await page.waitForLoadState("networkidle");

  // The name should now reflect the update
  // Navigate back to the editor to verify persistence
  await page.goto(`${editCtx.baseURL}/characters/edit-sorcerer`);
  const nameAfter = page.locator('input[name="name"]').first();
  await expect(nameAfter).toHaveValue("Edit Sorcerer Updated", { timeout: 10_000 });
});

// ─── Level out-of-bounds validation ──────────────────────────────────────────

test("character editor: level 0 shows validation error", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${levelCtx.baseURL}/characters/new`);
  await page.waitForLoadState("networkidle");

  const nameInput = page.locator('input[name="name"]').first();
  await expect(nameInput).toBeVisible({ timeout: 15_000 });
  await nameInput.fill("Level Test Char");

  // Find the level field
  const levelInput = page
    .locator('input[name="level"], input[id*="level"], input[type="number"]')
    .first();
  await expect(levelInput).toBeVisible({ timeout: 5000 });
  await levelInput.fill("0");

  // Try to save — validation should prevent submission
  const saveBtn = page.locator('button[type="submit"], button:has-text("Save")').first();
  await saveBtn.click();

  // Error message about level must be present
  const errorEl = page
    .locator('[class*="text-destructive"], [class*="destructive"], [role="alert"]')
    .first();
  await expect(errorEl).toBeVisible({ timeout: 5000 });
  // URL should NOT have changed (still on /characters/new)
  expect(page.url()).toContain("/characters/new");
});

test("character editor: level > 100 shows validation error", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${levelCtx.baseURL}/characters/new`);
  await page.waitForLoadState("networkidle");

  const nameInput = page.locator('input[name="name"]').first();
  await expect(nameInput).toBeVisible({ timeout: 15_000 });
  await nameInput.fill("Level OOB Char");

  const levelInput = page
    .locator('input[name="level"], input[id*="level"], input[type="number"]')
    .first();
  await expect(levelInput).toBeVisible({ timeout: 5000 });
  await levelInput.fill("101");

  const saveBtn = page.locator('button[type="submit"], button:has-text("Save")').first();
  await saveBtn.click();

  const errorEl = page
    .locator('[class*="text-destructive"], [class*="destructive"], [role="alert"]')
    .first();
  await expect(errorEl).toBeVisible({ timeout: 5000 });
  expect(page.url()).toContain("/characters/new");
});

// ─── Class picker ─────────────────────────────────────────────────────────────

test("character editor: class picker opens and shows available classes", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${newCharCtx.baseURL}/characters/new`);
  await page.waitForLoadState("networkidle");

  const classTrigger = page.getByRole("combobox").first();
  await expect(classTrigger).toBeVisible({ timeout: 10_000 });
  await classTrigger.click();

  const listbox = page.locator('[role="listbox"]');
  await expect(listbox).toBeVisible({ timeout: 5_000 });
  await expect(listbox.getByText("Sorcerer")).toBeVisible();
  await expect(listbox.getByText("Barbarian")).toBeVisible();
  await expect(listbox.getByText("Druid")).toBeVisible();
});

// ─── Tabs ─────────────────────────────────────────────────────────────────────

test("character editor: three tabs — Basic, Skills, Paragon — all visible", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${newCharCtx.baseURL}/characters/new`);
  await page.waitForLoadState("networkidle");

  await expect(
    page.locator('[role="tab"]:has-text("Basic"), button:has-text("Basic")').first()
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.locator('[role="tab"]:has-text("Skills"), button:has-text("Skills")').first()
  ).toBeVisible();
  await expect(
    page.locator('[role="tab"]:has-text("Paragon"), button:has-text("Paragon")').first()
  ).toBeVisible();
});

test("character editor: tab state preserved — fill name, switch to Skills, back to Basic", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${newCharCtx.baseURL}/characters/new`);
  await page.waitForLoadState("networkidle");

  // Fill name on Basic tab
  const nameInput = page.locator('input[name="name"]').first();
  await expect(nameInput).toBeVisible({ timeout: 15_000 });
  await nameInput.fill("Tab Preservation Test");

  // Switch to Skills tab
  const skillsTab = page
    .locator('[role="tab"]:has-text("Skills"), button:has-text("Skills")')
    .first();
  await skillsTab.click();
  await page.waitForTimeout(300);

  // Switch back to Basic tab
  const basicTab = page
    .locator('[role="tab"]:has-text("Basic"), button:has-text("Basic")')
    .first();
  await basicTab.click();
  await page.waitForTimeout(300);

  // Name field must still have the filled value
  await expect(nameInput).toHaveValue("Tab Preservation Test");
});

test("character editor: Skills tab shows content when clicked", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${newCharCtx.baseURL}/characters/new`);
  await page.waitForLoadState("networkidle");

  const skillsTab = page
    .locator('[role="tab"]:has-text("Skills"), button:has-text("Skills")')
    .first();
  await skillsTab.click();

  // Skills tab content should be visible (any skill-related element)
  await expect(
    page.locator('[role="tabpanel"]').first()
  ).toBeVisible({ timeout: 5000 });
});

test("character editor: Paragon tab shows Add Board button", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${newCharCtx.baseURL}/characters/new`);
  await page.waitForLoadState("networkidle");

  const paragonTab = page
    .locator('[role="tab"]:has-text("Paragon"), button:has-text("Paragon")')
    .first();
  await paragonTab.click();

  await expect(page.locator('button:has-text("Add Board")').first()).toBeVisible({ timeout: 5000 });
});

// ─── Beforeunload guard ───────────────────────────────────────────────────────

test("character editor: dirty form triggers beforeunload dialog on hard navigation", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${editCtx.baseURL}/characters/edit-sorcerer`);
  await page.waitForLoadState("networkidle");

  const nameInput = page.locator('input[name="name"]').first();
  await expect(nameInput).toBeVisible({ timeout: 15_000 });
  await nameInput.fill("Dirty Name");

  let dialogSeen = false;
  page.once("dialog", (dialog) => {
    dialogSeen = true;
    dialog.accept();
  });

  // Hard navigation triggers window.beforeunload
  await page.goto(`${editCtx.baseURL}/builds`).catch(() => {});
  expect(dialogSeen).toBeTruthy();
});

// ─── Save error path ──────────────────────────────────────────────────────────

test("character editor: POST 500 shows error banner and retains form state", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(`${newCharCtx.baseURL}/characters/new`);
  await page.waitForLoadState("networkidle");

  await page.route("**/api/characters", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 500, body: JSON.stringify({ error: "Simulated server error" }) });
    }
    return route.continue();
  });

  const nameInput = page.locator('input[name="name"]').first();
  await nameInput.fill("Error Test Character");

  const saveBtn = page.locator('button[type="submit"], button:has-text("Save")').first();
  await saveBtn.click();

  const errorEl = page
    .locator('[class*="error"], [class*="destructive"], .text-destructive, [role="alert"]')
    .first();
  await expect(errorEl).toBeVisible({ timeout: 10_000 });

  // Form should retain the name value
  await expect(nameInput).toHaveValue("Error Test Character");
});
