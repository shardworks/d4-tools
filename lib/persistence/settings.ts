/**
 * User settings persistence (T6 / D8).
 *
 * Settings are stored at ${DATA_DIR}/settings.json.
 * Currently tracks: region picker (D8) for the Blizzard API client.
 * Readable server-side so the API client can select the correct base URL.
 */

import { readJsonFile, writeJsonFile } from "./index";

const SETTINGS_FILE = "settings.json";

export interface AppSettings {
  /** Selected Blizzard API region. Used by the D4 API client to pick the correct base URL. */
  region?: "americas" | "europe" | "asia";
}

/**
 * Load app settings from disk. Returns an empty object if the file does not exist.
 */
export async function loadSettings(): Promise<AppSettings> {
  const data = await readJsonFile<AppSettings>(SETTINGS_FILE);
  return data ?? {};
}

/**
 * Persist app settings to disk (atomic write).
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeJsonFile(SETTINGS_FILE, settings);
}
