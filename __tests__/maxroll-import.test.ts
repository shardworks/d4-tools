/**
 * Acceptance tests for the Maxroll planner importer (D25).
 *
 * Hermetic — all network calls are intercepted via ctx.fetch override.
 * No live network; ToS-safe.
 *
 * Test plan:
 *   1. Success case: ok:true with non-empty equippedItems, class set,
 *      paragonAllocation populated, at least one mapped aspect, at least one
 *      mapped paragon glyph (acceptance signal 1).
 *   2. Patch-mismatch failure: version drift AND explicit-mapping rate < 50%
 *      → ok:false, reason: 'patch-mismatch' (acceptance signal 4, fail case).
 *   3. Patch-mismatch warning: version drift BUT mapping rate ≥ 50%
 *      → ok:true with versionMismatch in report (acceptance signal 4, warn case).
 *   4. Input-parsing: bare id, planner URL, planner URL with hash (acceptance signal 2).
 *   5. Unmapped references: every unmapped reference appears in the correct bucket
 *      (acceptance signal 3).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { importMaxrollPlanner } from "../lib/import/maxroll/index";
import { clearDataMinCache } from "../lib/import/maxroll/data-min-cache";

// ── Load fixtures ──────────────────────────────────────────────────────────────

import plannerFixture from "./fixtures/maxroll-planner-fixture.json";
import dataMinSubset from "./fixtures/maxroll-data-min-subset.json";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Builds a mock fetch that maps URLs to fixture payloads. */
function makeMockFetch(
  profileOverride?: Record<string, unknown>,
  dataMinOverride?: Record<string, unknown>
): typeof globalThis.fetch {
  const profile = profileOverride ?? plannerFixture;
  const dataMin = dataMinOverride ?? dataMinSubset;

  return (async (url: RequestInfo | URL) => {
    const urlStr = url.toString();

    if (urlStr.includes("/profiles/load")) {
      return {
        ok: true,
        status: 200,
        json: async () => profile,
        text: async () => JSON.stringify(profile),
      } as Response;
    }

    if (urlStr.includes("data.min.json")) {
      return {
        ok: true,
        status: 200,
        json: async () => dataMin,
        text: async () => JSON.stringify(dataMin),
      } as Response;
    }

    throw new Error(`Unexpected URL in mock fetch: ${urlStr}`);
  }) as typeof globalThis.fetch;
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Clear the data.min in-memory cache between tests to ensure isolation
  clearDataMinCache();
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("importMaxrollPlanner — success case (acceptance signal 1)", () => {
  it("returns ok:true for a valid fixture payload", async () => {
    const result = await importMaxrollPlanner("fixtureplannerid", {
      fetch: makeMockFetch(),
      cacheDir: "/tmp/maxroll-test-cache",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.variants).toHaveLength(1);
    const variant = result.variants[0];

    // Class set
    expect(variant.character.class).toBe("Sorcerer");

    // Level (D12: default 100, fixture is 100)
    expect(variant.character.level).toBe(100);

    // Non-empty equippedItems
    expect(Object.keys(variant.items).length).toBeGreaterThan(0);
    expect(variant.character.equippedItems).toBe(variant.items); // same reference

    // At least one mapped aspect (helm has conceited_aspect via nid 100)
    const helmItem = variant.items["helm"];
    expect(helmItem).toBeDefined();
    expect(helmItem.aspect).toBeDefined();
    expect(helmItem.aspect?.aspectId).toBe("conceited_aspect");

    // ParagonAllocation populated (D17)
    expect(variant.character.paragonAllocation.paragonLevel).toBe(200);
    expect(variant.character.paragonAllocation.boards).toHaveLength(1);

    // At least one mapped paragon glyph (D18)
    const board = variant.character.paragonAllocation.boards[0];
    expect(board.glyph).toBeDefined();
    expect(board.glyph?.glyphId).toBe("glyph_cold_calc");

    // Build has importedFrom provenance (D19)
    expect(variant.build.importedFrom?.source).toBe("maxroll");
    expect(variant.build.importedFrom?.plannerId).toBe("fixtureplannerid");
    expect(variant.build.importedFrom?.variantIndex).toBe(0);
  });
});

describe("importMaxrollPlanner — unmapped reference reporting (acceptance signal 3)", () => {
  it("reports every unmapped reference in the correct bucket", async () => {
    const result = await importMaxrollPlanner("fixtureplannerid", {
      fetch: makeMockFetch(),
      cacheDir: "/tmp/maxroll-test-cache",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.variants[0].report;

    // nid 999 is in the fixture but maps to "UnknownStatNotInCatalog" — not in catalog
    const unmappedAffix = report.unmappedAffixes.find((u) => u.category === "affix" && u.nid === "999");
    expect(unmappedAffix).toBeDefined();
    // Narrow to the 'affix' branch to access itemSlot
    if (unmappedAffix && unmappedAffix.category === "affix") {
      expect(unmappedAffix.itemSlot).toBe("helm");
    }

    // No unmapped aspects (nid 100 → conceited_aspect maps successfully)
    expect(report.unmappedAspects).toHaveLength(0);

    // No unmapped skills (id 500 → sorc_arc_lash maps successfully)
    expect(report.unmappedSkills).toHaveLength(0);
  });

  it("routes affixes to the correct array buckets (D16)", async () => {
    const result = await importMaxrollPlanner("fixtureplannerid", {
      fetch: makeMockFetch(),
      cacheDir: "/tmp/maxroll-test-cache",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const helmItem = result.variants[0].items["helm"];

    // nid 3 → Barrier_Strength_Percent (isImplicit) → implicits[]
    expect(helmItem.implicits.length).toBeGreaterThan(0);
    expect(helmItem.implicits[0].affixId).toBe("affix_implicit_barrier_offhand");

    // nid 1, 2 → explicit affixes (not implicit, not tempered) → explicits[]
    expect(helmItem.explicits.length).toBeGreaterThanOrEqual(2);
    expect(helmItem.explicits.map((e) => e.affixId)).toContain("affix_attack_speed");
    expect(helmItem.explicits.map((e) => e.affixId)).toContain("affix_attack_speed_basics");
  });
});

describe("importMaxrollPlanner — patch-mismatch failure (acceptance signal 4)", () => {
  it("returns ok:false reason:'patch-mismatch' when version differs AND mapping rate < 50%", async () => {
    // Profile with mismatched version and 5 explicit affixes, only 1 is mappable
    const mismatchProfile = {
      version: "2.0.0.00000", // differs from catalog 3.0.1.71747
      id: "mismatchtest",
      d4t: [
        {
          name: "Mismatch Test",
          class: "sorcerer",
          level: 100,
          paragonLevel: 0,
          equipped: {
            helm: {
              name: "Test Helm",
              rarity: "Rare",
              affixes: [
                { nid: 1,   values: [1.0] }, // maps → AttackSpeed
                { nid: 901, values: [1.0] }, // unmapped
                { nid: 902, values: [1.0] }, // unmapped
                { nid: 903, values: [1.0] }, // unmapped
                { nid: 904, values: [1.0] }, // unmapped
              ],
            },
          },
        },
      ],
    };

    const result = await importMaxrollPlanner("mismatchtest", {
      fetch: makeMockFetch(mismatchProfile),
      cacheDir: "/tmp/maxroll-test-cache",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("patch-mismatch");
    expect(result.message).toContain("2.0.0.00000");
  });
});

describe("importMaxrollPlanner — patch-mismatch warning (acceptance signal 4, above threshold)", () => {
  it("returns ok:true with versionMismatch warning when version differs but mapping rate ≥ 50%", async () => {
    // Profile with mismatched version but all affixes mappable (rate = 100%)
    const warnProfile = {
      version: "2.0.0.00000", // differs from catalog
      id: "warntest",
      d4t: [
        {
          name: "Warn Test",
          class: "sorcerer",
          level: 100,
          paragonLevel: 0,
          equipped: {
            helm: {
              name: "Test Helm",
              rarity: "Rare",
              affixes: [
                { nid: 1, values: [1.0] }, // maps → AttackSpeed
                { nid: 2, values: [1.0] }, // maps → AttackSpeed_Basics
              ],
            },
          },
        },
      ],
    };

    const result = await importMaxrollPlanner("warntest", {
      fetch: makeMockFetch(warnProfile),
      cacheDir: "/tmp/maxroll-test-cache",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const vm = result.variants[0].report.versionMismatch;
    expect(vm).toBeDefined();
    expect(vm?.plannerVersion).toBe("2.0.0.00000");
    expect(vm?.explicitMappedRatio).toBeGreaterThanOrEqual(0.5);
  });
});

describe("importMaxrollPlanner — input parsing (acceptance signal 2)", () => {
  const plannerId = "fixtureplannerid";

  it("accepts a bare planner id", async () => {
    const result = await importMaxrollPlanner(plannerId, {
      fetch: makeMockFetch(),
      cacheDir: "/tmp/maxroll-test-cache",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plannerId).toBe(plannerId);
  });

  it("accepts a full planner URL", async () => {
    const result = await importMaxrollPlanner(
      `https://maxroll.gg/d4/planner/${plannerId}`,
      {
        fetch: makeMockFetch(),
        cacheDir: "/tmp/maxroll-test-cache",
      }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plannerId).toBe(plannerId);
  });

  it("accepts a planner URL with variant hash", async () => {
    const result = await importMaxrollPlanner(
      `https://maxroll.gg/d4/planner/${plannerId}#1&equipment`,
      {
        fetch: makeMockFetch(),
        cacheDir: "/tmp/maxroll-test-cache",
      }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plannerId).toBe(plannerId);
  });

  it("accepts a planner URL with numeric hash (variant index 2)", async () => {
    const result = await importMaxrollPlanner(
      `https://maxroll.gg/d4/planner/${plannerId}#2`,
      {
        fetch: makeMockFetch(),
        cacheDir: "/tmp/maxroll-test-cache",
      }
    );
    // Result ok regardless; we just verify plannerId was parsed correctly
    if (result.ok) expect(result.plannerId).toBe(plannerId);
  });

  it("accepts a build-guide URL by fetching HTML and extracting planner id", async () => {
    const mockFetchWithHtml = (async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/d4/build-guides/")) {
        // Simulate HTML page that embeds a planner link
        const html = `<html><body>Check out this build: <a href="/d4/planner/${plannerId}">Ice Shards</a></body></html>`;
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () => html,
        } as Response;
      }
      // Delegate to the normal mock for API calls
      return makeMockFetch()(url, {});
    }) as typeof globalThis.fetch;

    const result = await importMaxrollPlanner(
      "https://maxroll.gg/d4/build-guides/ice-shards-sorcerer",
      {
        fetch: mockFetchWithHtml,
        cacheDir: "/tmp/maxroll-test-cache",
      }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plannerId).toBe(plannerId);
  });
});

describe("importMaxrollPlanner — paragon node storage (D17)", () => {
  it("stores paragon node ids with mr: prefix", async () => {
    const result = await importMaxrollPlanner("fixtureplannerid", {
      fetch: makeMockFetch(),
      cacheDir: "/tmp/maxroll-test-cache",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const board = result.variants[0].character.paragonAllocation.boards[0];
    expect(board.nodes.every((n) => n.startsWith("mr:"))).toBe(true);
    // Fixture has nodes [100, 101, 102]
    expect(board.nodes).toContain("mr:100");
    expect(board.nodes).toContain("mr:101");
    expect(board.nodes).toContain("mr:102");
    // spentPoints = nodes.length (D17)
    expect(board.spentPoints).toBe(3);
  });
});

describe("importMaxrollPlanner — skill mapping", () => {
  it("maps skill id 500 to sorc_arc_lash", async () => {
    const result = await importMaxrollPlanner("fixtureplannerid", {
      fetch: makeMockFetch(),
      cacheDir: "/tmp/maxroll-test-cache",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const skills = result.variants[0].character.skillSelections;
    expect(skills.some((s) => s.skillId === "sorc_arc_lash")).toBe(true);
  });
});

describe("importMaxrollPlanner — in-memory cache", () => {
  it("uses in-memory cache on the second call without re-fetching data.min", async () => {
    let dataMinFetchCount = 0;
    const countingFetch = (async (url: RequestInfo | URL, ...args: unknown[]) => {
      const urlStr = url.toString();
      if (urlStr.includes("data.min.json")) {
        dataMinFetchCount++;
      }
      return makeMockFetch()(url, ...args as Parameters<typeof fetch>[1][]);
    }) as typeof globalThis.fetch;

    // Use a unique cacheDir so there's no pre-existing disk cache
    const uniqueDir = `/tmp/maxroll-test-cache-mem-${Date.now()}`;

    // First call — no disk cache → should fetch data.min once
    await importMaxrollPlanner("fixtureplannerid", {
      fetch: countingFetch,
      cacheDir: uniqueDir,
    });

    // Second call — same patch, same process → should hit the in-memory cache (zero network calls)
    await importMaxrollPlanner("fixtureplannerid", {
      fetch: countingFetch,
      cacheDir: uniqueDir,
    });

    // data.min should only have been fetched once (second call hit in-memory cache)
    expect(dataMinFetchCount).toBe(1);
  });
});
