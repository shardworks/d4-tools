/**
 * e2e test fixture harness entry point (T3).
 *
 * Usage (in a spec's beforeAll / afterAll):
 *
 *   import { createTestContext, destroyTestContext, type TestContext } from "./fixtures";
 *
 *   let ctx: TestContext;
 *   test.beforeAll(async () => {
 *     ctx = await createTestContext(async (seeder) => {
 *       await seeder.saveCharacter({ id: "my-char", name: "...", class: "Sorcerer", level: 50 });
 *     });
 *   });
 *   test.afterAll(() => destroyTestContext(ctx));
 *
 *   test("loads builds", async ({ page }) => {
 *     await page.goto(`${ctx.baseURL}/builds`);
 *   });
 *
 * Isolation guarantee (D5, D6):
 *   - Each createTestContext() call mkdtemps fresh DATA_DIR and SCREENSHOT_DIR.
 *   - Each call spawns a new next dev instance on a unique OS-assigned port.
 *   - destroyTestContext() kills the server and recursively removes temp dirs.
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { getFreePort } from "./port";
import { AnthropicMockServer } from "./mock-server";
import { startNextServer, type TestServer } from "./server";
import { createSeeder, type Seeder } from "./seed";

export type { Seeder } from "./seed";
export { AnthropicMockServer } from "./mock-server";

export interface TestContext {
  /** Per-spec temp directory for DATA_DIR. */
  dataDir: string;
  /** Per-spec temp directory for SCREENSHOT_DIR. */
  screenshotDir: string;
  /** In-process Anthropic stub server. */
  mockServer: AnthropicMockServer;
  /** Running next dev server. */
  appServer: TestServer;
  /** Base URL of the running app (http://127.0.0.1:<port>). */
  baseURL: string;
  /** Seeder for the current spec's data dirs. */
  seeder: Seeder;
}

export type SeedFunction = (seeder: Seeder, ctx: Omit<TestContext, "appServer" | "baseURL">) => Promise<void>;

/**
 * Creates an isolated test context:
 *   1. mkdtemps DATA_DIR and SCREENSHOT_DIR.
 *   2. Starts the Anthropic mock server.
 *   3. Runs the optional seedFn to populate the temp dirs.
 *   4. Starts next dev on a free port with the seeded env vars.
 *
 * @param seedFn  Optional async function to seed data before the server starts.
 *                Receives the Seeder and partial TestContext (without appServer/baseURL).
 */
export async function createTestContext(seedFn?: SeedFunction): Promise<TestContext> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "d4-e2e-data-"));
  const screenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), "d4-e2e-ss-"));

  const mockPort = await getFreePort();
  const appPort = await getFreePort();

  const mockServer = new AnthropicMockServer(mockPort);
  await mockServer.start();

  const seeder = createSeeder({ dataDir, screenshotDir });

  if (seedFn) {
    const partial = { dataDir, screenshotDir, mockServer, seeder };
    await seedFn(seeder, partial);
  }

  const appServer = await startNextServer({
    port: appPort,
    dataDir,
    screenshotDir,
    anthropicApiUrl: mockServer.apiUrl,
  });

  const baseURL = appServer.url;

  return { dataDir, screenshotDir, mockServer, appServer, baseURL, seeder };
}

/**
 * Tears down a test context created by createTestContext():
 *   1. Kills the next dev server.
 *   2. Stops the mock server.
 *   3. Recursively removes temp dirs.
 */
export async function destroyTestContext(ctx: TestContext): Promise<void> {
  await ctx.appServer.stop();
  await ctx.mockServer.stop();
  await fs.rm(ctx.dataDir, { recursive: true, force: true });
  await fs.rm(ctx.screenshotDir, { recursive: true, force: true });
}

/**
 * Dismisses the SoftGate overlay by setting the localStorage key.
 * Must be called before interacting with the app in any spec (D5).
 */
export async function dismissSoftGate(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("d4-gate-dismissed", "true");
  });
}
