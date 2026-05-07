/**
 * Settings persistence tests.
 *
 * Uses the mkdtemp + DATA_DIR override + dynamic import() pattern
 * from __tests__/persistence.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("settings persistence (DATA_DIR-dependent)", () => {
  let tmpDir: string;
  const origDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "d4-settings-"));
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    process.env.DATA_DIR = origDataDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("loadSettings returns empty object when file does not exist", async () => {
    const { loadSettings } = await import("../lib/persistence/settings");
    const settings = await loadSettings();
    expect(settings).toEqual({});
  });

  it("saveSettings creates a settings.json file in DATA_DIR", async () => {
    const { saveSettings } = await import("../lib/persistence/settings");
    await saveSettings({ region: "americas" });
    const files = await fs.readdir(tmpDir);
    expect(files).toContain("settings.json");
  });

  it("loadSettings returns saved region after saveSettings", async () => {
    const { loadSettings, saveSettings } = await import("../lib/persistence/settings");
    await saveSettings({ region: "europe" });
    const loaded = await loadSettings();
    expect(loaded.region).toBe("europe");
  });

  it("saveSettings round-trips all three valid regions", async () => {
    const { loadSettings, saveSettings } = await import("../lib/persistence/settings");
    for (const region of ["americas", "europe", "asia"] as const) {
      await saveSettings({ region });
      const loaded = await loadSettings();
      expect(loaded.region).toBe(region);
    }
  });

  it("loadSettings returns empty object after saving empty settings", async () => {
    const { loadSettings, saveSettings } = await import("../lib/persistence/settings");
    await saveSettings({});
    const loaded = await loadSettings();
    expect(loaded).toEqual({});
  });

  it("saveSettings overwrites previous value", async () => {
    const { loadSettings, saveSettings } = await import("../lib/persistence/settings");
    await saveSettings({ region: "americas" });
    await saveSettings({ region: "asia" });
    const loaded = await loadSettings();
    expect(loaded.region).toBe("asia");
  });
});
