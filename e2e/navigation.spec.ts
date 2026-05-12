/**
 * Navigation spec.
 *
 * Covers:
 *   - Home redirect: / → /builds
 *   - Sidebar nav links present (builds, new-character, triage)
 *   - Sidebar collapse toggle changes aria-label
 *   - Sidebar collapse state persists across reload (localStorage-backed)
 *   - Active-route highlight: each nav link is aria-current="page" on its route
 *   - Page titles correct per route
 *   - Command palette opens via Ctrl/Cmd+K and closes with Escape
 *   - Command palette: Export Build → JSON download with suggestedFilename *.json
 *   - Command palette: Import Build → filechooser event
 *   - Command palette: Create New Character → navigates to /characters/new
 *   - Command palette: Go to Build → navigates to /builds/<id>
 *   - SoftGate overlay dismissed before any interaction
 */

import { test, expect } from "@playwright/test";
import { createTestContext, destroyTestContext, dismissSoftGate, type TestContext } from "./fixtures";

// ─── Shared context ───────────────────────────────────────────────────────────

let ctx: TestContext;

test.beforeAll(async () => {
  ctx = await createTestContext(async (seeder) => {
    await seeder.saveCharacter({
      id: "nav-sorcerer",
      name: "Nav Sorcerer",
      class: "Sorcerer",
      level: 50,
    });
    await seeder.saveBuild({
      id: "nav-build",
      characterId: "nav-sorcerer",
      name: "Nav Build",
    });
    await seeder.setActiveBuild("nav-build");
  });
});

test.afterAll(async () => {
  await destroyTestContext(ctx);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function url(p: string) {
  return `${ctx.baseURL}${p}`;
}

const isMac = process.platform === "darwin";
const modKey = isMac ? "Meta" : "Control";

// ─── Basic navigation ─────────────────────────────────────────────────────────

test("home redirect: / redirects to /builds", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(url("/"));
  await page.waitForURL(/\/builds$/);
  expect(page.url()).toMatch(/\/builds$/);
});

// ─── Page titles ──────────────────────────────────────────────────────────────

test("page title: /builds shows 'Builds' in title", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(url("/builds"));
  await expect(page).toHaveTitle(/Builds/i);
});

test("page title: /characters/new shows a non-empty title", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(url("/characters/new"));
  const title = await page.title();
  expect(title.length).toBeGreaterThan(0);
});

test("page title: /triage shows 'Triage' in title", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(url("/triage"));
  await expect(page).toHaveTitle(/Triage/i);
});

// ─── SoftGate ─────────────────────────────────────────────────────────────────

test("SoftGate dismissed: localStorage key bypasses overlay", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(url("/builds"));
  // SoftGate must not be blocking — we should see the sidebar
  const sidebar = page.locator("nav, [aria-label='Sidebar'], aside").first();
  await expect(sidebar).toBeVisible({ timeout: 10_000 });
});

// ─── Sidebar ─────────────────────────────────────────────────────────────────

test("sidebar: nav links present for builds, characters, triage", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(url("/builds"));
  await page.waitForLoadState("networkidle");
  await expect(page.locator('a[href="/builds"]').first()).toBeVisible();
  await expect(page.locator('a[href="/characters/new"]').first()).toBeVisible();
  await expect(page.locator('a[href="/triage"]').first()).toBeVisible();
});

test("sidebar: collapse toggle changes aria-label", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(url("/builds"));
  await page.waitForLoadState("networkidle");

  const collapseBtn = page.locator('button[aria-label="Collapse sidebar"]');
  const expandBtn = page.locator('button[aria-label="Expand sidebar"]');

  const isCollapsed = await expandBtn.isVisible().catch(() => false);
  if (isCollapsed) {
    await expandBtn.click();
    await expect(collapseBtn).toBeVisible();
  } else {
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();
    await expect(collapseBtn).toBeVisible();
  }
});

test("sidebar: collapse state persists across reload (localStorage-backed)", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(url("/builds"));
  await page.waitForLoadState("networkidle");

  const collapseBtn = page.locator('button[aria-label="Collapse sidebar"]');
  const expandBtn = page.locator('button[aria-label="Expand sidebar"]');

  // Ensure sidebar is expanded first
  const isCollapsed = await expandBtn.isVisible().catch(() => false);
  if (isCollapsed) {
    await expandBtn.click();
    await expect(collapseBtn).toBeVisible();
  }

  // Collapse it
  await collapseBtn.click();
  await expect(expandBtn).toBeVisible({ timeout: 3000 });

  // Reload and check state is restored (collapsed → expand button visible)
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(expandBtn).toBeVisible({ timeout: 10_000 });

  // Restore — expand so subsequent tests are not affected
  await expandBtn.click();
});

test("sidebar: active-route highlight on /builds", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(url("/builds"));
  await page.waitForLoadState("networkidle");

  // The active nav link should have aria-current="page" (or data-active="true")
  const activeLink = page
    .locator('a[href="/builds"][aria-current="page"], a[href="/builds"][data-active="true"]')
    .first();
  await expect(activeLink).toBeVisible({ timeout: 10_000 });
});

test("sidebar: active-route highlight on /triage", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(url("/triage"));
  await page.waitForLoadState("networkidle");

  const activeLink = page
    .locator('a[href="/triage"][aria-current="page"], a[href="/triage"][data-active="true"]')
    .first();
  await expect(activeLink).toBeVisible({ timeout: 10_000 });
});

// ─── Command palette ──────────────────────────────────────────────────────────

test("command palette: Ctrl/Cmd+K opens the palette", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(url("/builds"));
  await page.waitForLoadState("networkidle");

  await page.keyboard.press(`${modKey}+k`);
  const palette = page.locator('[cmdk-root]').first();
  await expect(palette).toBeVisible({ timeout: 5000 });
});

test("command palette: Escape closes the palette", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(url("/builds"));
  await page.waitForLoadState("networkidle");

  await page.keyboard.press(`${modKey}+k`);
  const palette = page.locator('[cmdk-root]').first();
  await expect(palette).toBeVisible({ timeout: 5000 });

  await page.keyboard.press("Escape");
  await expect(palette).not.toBeVisible({ timeout: 3000 });
});

test("command palette: 'Create New Character' navigates to /characters/new", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(url("/builds"));
  await page.waitForLoadState("networkidle");

  await page.keyboard.press(`${modKey}+k`);
  const palette = page.locator('[cmdk-root]').first();
  await expect(palette).toBeVisible({ timeout: 5000 });

  await page.keyboard.type("New Character");

  const item = page
    .locator('[cmdk-item]:has-text("New Character"), [role="option"]:has-text("New Character")')
    .first();
  await expect(item).toBeVisible({ timeout: 3000 });
  await item.click();

  await page.waitForURL(/\/characters\/new/, { timeout: 10_000 });
  expect(page.url()).toContain("/characters/new");
});

test("command palette: Export Build command triggers JSON download", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(url("/builds"));
  await page.waitForLoadState("networkidle");

  await page.keyboard.press(`${modKey}+k`);
  const palette = page.locator('[cmdk-root]').first();
  await expect(palette).toBeVisible({ timeout: 5000 });

  await page.keyboard.type("Export");

  const exportItem = page.locator('[cmdk-item]:has-text("Export Build")').first();
  await expect(exportItem).toBeVisible({ timeout: 3000 });
  await exportItem.click();

  // Now in build-picker mode — clear search and select our build
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");

  const buildItem = page.locator('[cmdk-item]:has-text("Nav Build")').first();
  await expect(buildItem).toBeVisible({ timeout: 5000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    buildItem.click(),
  ]);
  expect(download).toBeTruthy();
  expect(download.suggestedFilename()).toMatch(/\.json$/);
});

test("command palette: Import Build command triggers filechooser", async ({ page }) => {
  await dismissSoftGate(page);
  await page.goto(url("/builds"));
  await page.waitForLoadState("networkidle");

  await page.keyboard.press(`${modKey}+k`);
  const palette = page.locator('[cmdk-root]').first();
  await expect(palette).toBeVisible({ timeout: 5000 });

  await page.keyboard.type("Import");

  const importItem = page
    .locator('[cmdk-item]:has-text("Import Build"), [role="option"]:has-text("Import Build")')
    .first();
  await expect(importItem).toBeVisible({ timeout: 3000 });

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    importItem.click(),
  ]);
  expect(chooser).toBeTruthy();
  // Cancel the dialog (don't actually import)
  await chooser.setFiles([]);
});

test(
  "command palette: 'Go to Build…' navigates to /builds/<id>",
  async ({ page }) => {
    await dismissSoftGate(page);
    await page.goto(url("/builds"));
    await page.waitForLoadState("networkidle");

    await page.keyboard.press(`${modKey}+k`);
    const palette = page.locator('[cmdk-root]').first();
    await expect(palette).toBeVisible({ timeout: 5000 });

    await page.keyboard.type("Go to Build");
    const goItem = page.locator('[cmdk-item]:has-text("Go to Build")').first();
    await expect(goItem).toBeVisible({ timeout: 3000 });
    await goItem.click();

    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");

    const buildItem = page.locator('[cmdk-item]:has-text("Nav Build")').first();
    await expect(buildItem).toBeVisible({ timeout: 5000 });
    await buildItem.click();

    await page.waitForURL(/\/builds\/nav-build/, { timeout: 5000 });
    expect(page.url()).toContain("/builds/nav-build");
  }
);
