/**
 * Unit tests for OAuth state/PKCE helpers and token persistence.
 *
 * Uses the mkdtemp + DATA_DIR override + dynamic import() pattern
 * from __tests__/persistence.test.ts for any tests that touch getDataDir().
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "node:crypto";

// ─── OAuth helper unit tests (no DATA_DIR needed) ──────────────────────────

describe("generateState", () => {
  it("returns a 64-character hex string", async () => {
    const { generateState } = await import("../lib/blizzard/oauth");
    const state = generateState();
    expect(state).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates distinct values on each call", async () => {
    const { generateState } = await import("../lib/blizzard/oauth");
    const s1 = generateState();
    const s2 = generateState();
    expect(s1).not.toBe(s2);
  });
});

describe("generatePKCE", () => {
  it("returns a verifier and challenge", async () => {
    const { generatePKCE } = await import("../lib/blizzard/oauth");
    const { verifier, challenge } = generatePKCE();
    expect(typeof verifier).toBe("string");
    expect(typeof challenge).toBe("string");
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it("challenge is S256 of verifier (base64url of sha256)", async () => {
    const { generatePKCE } = await import("../lib/blizzard/oauth");
    const { verifier, challenge } = generatePKCE();
    const expected = crypto.createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
  });

  it("verifier contains only URL-safe characters", async () => {
    const { generatePKCE } = await import("../lib/blizzard/oauth");
    const { verifier } = generatePKCE();
    // base64url uses A-Z, a-z, 0-9, -, _
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates distinct verifiers on each call", async () => {
    const { generatePKCE } = await import("../lib/blizzard/oauth");
    const { verifier: v1 } = generatePKCE();
    const { verifier: v2 } = generatePKCE();
    expect(v1).not.toBe(v2);
  });
});

describe("buildAuthorizeUrl", () => {
  it("includes all required OAuth params", async () => {
    const { buildAuthorizeUrl } = await import("../lib/blizzard/oauth");
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "test-client-id",
        redirectUri: "https://localhost:3000/api/auth/battlenet/callback",
        state: "abc123",
        codeChallenge: "challenge-xyz",
      })
    );

    expect(url.hostname).toBe("oauth.battle.net");
    expect(url.pathname).toBe("/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("scope")).toBe("d4.profile");
    expect(url.searchParams.get("state")).toBe("abc123");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-xyz");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://localhost:3000/api/auth/battlenet/callback"
    );
  });
});

describe("getClientCredentials", () => {
  const origClientId = process.env.BLIZZARD_CLIENT_ID;
  const origClientSecret = process.env.BLIZZARD_CLIENT_SECRET;

  afterEach(() => {
    process.env.BLIZZARD_CLIENT_ID = origClientId;
    process.env.BLIZZARD_CLIENT_SECRET = origClientSecret;
  });

  it("returns credentials when both env vars are set", async () => {
    process.env.BLIZZARD_CLIENT_ID = "my-client-id";
    process.env.BLIZZARD_CLIENT_SECRET = "my-client-secret";
    const { getClientCredentials } = await import("../lib/blizzard/oauth");
    const creds = getClientCredentials();
    expect(creds.clientId).toBe("my-client-id");
    expect(creds.clientSecret).toBe("my-client-secret");
  });

  it("throws a clear error when BLIZZARD_CLIENT_ID is missing", async () => {
    delete process.env.BLIZZARD_CLIENT_ID;
    delete process.env.BLIZZARD_CLIENT_SECRET;
    const { getClientCredentials } = await import("../lib/blizzard/oauth");
    expect(() => getClientCredentials()).toThrow("BLIZZARD_CLIENT_ID");
  });
});

// ─── Token persistence (DATA_DIR-scoped) ──────────────────────────────────

describe("token persistence (DATA_DIR-dependent)", () => {
  let tmpDir: string;
  const origDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "d4-bnet-test-"));
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    process.env.DATA_DIR = origDataDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("loadTokens returns null when no file exists", async () => {
    const { loadTokens } = await import("../lib/blizzard/tokens");
    const tokens = await loadTokens();
    expect(tokens).toBeNull();
  });

  it("saveTokens + loadTokens round-trips data", async () => {
    const { saveTokens, loadTokens } = await import("../lib/blizzard/tokens");

    const raw = {
      access_token: "test-access-token",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: "test-refresh-token",
    };

    const saved = await saveTokens(raw, "americas");
    expect(saved.accessToken).toBe("test-access-token");
    expect(saved.refreshToken).toBe("test-refresh-token");
    expect(saved.region).toBe("americas");
    expect(saved.expiresAt).toBeGreaterThan(Date.now());

    const loaded = await loadTokens();
    expect(loaded).not.toBeNull();
    expect(loaded!.accessToken).toBe("test-access-token");
    expect(loaded!.region).toBe("americas");
  });

  it("deleteTokens removes the file", async () => {
    const { saveTokens, deleteTokens, loadTokens } = await import("../lib/blizzard/tokens");

    const raw = {
      access_token: "to-delete",
      token_type: "Bearer",
      expires_in: 3600,
    };
    await saveTokens(raw, "europe");

    const deleted = await deleteTokens();
    expect(deleted).toBe(true);

    const loaded = await loadTokens();
    expect(loaded).toBeNull();
  });

  it("deleteTokens returns false when no file exists", async () => {
    const { deleteTokens } = await import("../lib/blizzard/tokens");
    const result = await deleteTokens();
    expect(result).toBe(false);
  });

  it("tokens file is written to DATA_DIR", async () => {
    const { saveTokens } = await import("../lib/blizzard/tokens");
    const raw = {
      access_token: "check-location",
      token_type: "Bearer",
      expires_in: 3600,
    };
    await saveTokens(raw, "asia");

    const files = await fs.readdir(tmpDir);
    expect(files).toContain("blizzard-tokens.json");
  });

  it("hasValidTokens returns false when tokens are expired", async () => {
    const { saveTokens, hasValidTokens } = await import("../lib/blizzard/tokens");

    // Save tokens that "expire" immediately (expires_in = 0)
    const raw = {
      access_token: "expired-token",
      token_type: "Bearer",
      expires_in: 0,
    };
    await saveTokens(raw, "americas");

    const valid = await hasValidTokens();
    expect(valid).toBe(false);
  });

  it("hasValidTokens returns true for fresh tokens", async () => {
    const { saveTokens, hasValidTokens } = await import("../lib/blizzard/tokens");

    const raw = {
      access_token: "fresh-token",
      token_type: "Bearer",
      expires_in: 3600,
    };
    await saveTokens(raw, "americas");

    const valid = await hasValidTokens();
    expect(valid).toBe(true);
  });
});

// Settings persistence tests live in __tests__/settings.test.ts (not duplicated here).

// ─── BnetApiError ─────────────────────────────────────────────────────────

describe("BnetApiError", () => {
  it("stores status and body", async () => {
    const { BnetApiError } = await import("../lib/blizzard/types");
    const err = new BnetApiError(429, "rate limited");
    expect(err.status).toBe(429);
    expect(err.body).toBe("rate limited");
    expect(err.name).toBe("BnetApiError");
  });

  it("retryAfterSeconds is undefined when not provided", async () => {
    const { BnetApiError } = await import("../lib/blizzard/types");
    const err = new BnetApiError(429, "rate limited", "Rate limit exceeded. Retry after unknown seconds.");
    expect(err.retryAfterSeconds).toBeUndefined();
  });

  it("retryAfterSeconds is set from the fourth constructor argument", async () => {
    const { BnetApiError } = await import("../lib/blizzard/types");
    const err = new BnetApiError(429, "rate limited", "Rate limit exceeded. Retry after 60 seconds.", 60);
    expect(err.retryAfterSeconds).toBe(60);
  });
});
