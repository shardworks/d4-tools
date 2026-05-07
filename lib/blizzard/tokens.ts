/**
 * Token storage for Battle.net OAuth tokens (D3).
 *
 * Tokens are persisted to ${DATA_DIR}/blizzard-tokens.json with mode 0600.
 * This matches the existing persistence convention (plaintext + atomic write).
 * Threat model: local single-user tool; no encryption required.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { getDataDir } from "@/lib/persistence/paths";
import { atomicWriteJson } from "@/lib/persistence";
import type { BnetTokens, BnetTokenResponse } from "./types";

const TOKENS_FILENAME = "blizzard-tokens.json";

function tokensFilePath(): string {
  return path.join(getDataDir(), TOKENS_FILENAME);
}

/**
 * Load stored tokens. Returns null if no tokens have been saved yet.
 */
export async function loadTokens(): Promise<BnetTokens | null> {
  const filePath = tokensFilePath();
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as BnetTokens;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Persist tokens to disk with mode 0600 (D3).
 * Converts the raw token response + metadata into the stored shape.
 */
export async function saveTokens(
  raw: BnetTokenResponse,
  region: BnetTokens["region"]
): Promise<BnetTokens> {
  const tokens: BnetTokens = {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt: Date.now() + raw.expires_in * 1000,
    region,
  };

  const filePath = tokensFilePath();
  await atomicWriteJson(filePath, tokens);

  // Set mode 0600 after write (atomicWriteJson creates file via rename)
  await fs.chmod(filePath, 0o600).catch(() => {
    // chmod may fail on some systems/environments; log but do not throw
    // The file is still protected by the DATA_DIR's directory permissions
  });

  return tokens;
}

/**
 * Delete the stored tokens file. Used by the disconnect flow (D25).
 * Returns true if the file was deleted, false if it didn't exist.
 */
export async function deleteTokens(): Promise<boolean> {
  const filePath = tokensFilePath();
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

/**
 * Check whether valid (non-expired) tokens are stored.
 * Returns true if tokens exist and are not expired.
 */
export async function hasValidTokens(): Promise<boolean> {
  const tokens = await loadTokens();
  if (!tokens) return false;
  // Consider tokens valid if they have at least 60 seconds remaining
  return tokens.expiresAt > Date.now() + 60_000;
}
