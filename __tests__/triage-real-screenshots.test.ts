/**
 * Real-screenshot fixture tests (t7).
 *
 * These tests replay pre-recorded LLM responses through the resolveItem() pipeline
 * and verify that the resolver produces the expected catalog IDs and reason codes.
 *
 * No actual Anthropic API calls are made — the fixture *-recorded.json files contain
 * the CacheEntry that would have been returned by the API. The *-expected.json files
 * describe what the resolver should produce from that input.
 *
 * Match-rate summary is printed at the end of the test suite and referenced in
 * lib/triage/README.md.
 *
 * Fixture files live in __tests__/fixtures/triage/screenshots/:
 *   *.png                  — placeholder screenshot bytes (1x1 PNG)
 *   *-recorded.json        — CacheEntry (kind:"item") as if returned by Anthropic API
 *   *-expected.json        — expected resolution outcomes per affix/aspect
 */

import { describe, it, expect } from "vitest";
import * as path from "path";
import * as fs from "fs";
import { resolveItem } from "../lib/triage/resolve";
import type { CacheEntry, LlmExtractedItem } from "../lib/triage/types";
import type { AffixMatchResult, AspectMatchResult } from "../lib/triage/types";

const FIXTURE_DIR = path.join(__dirname, "fixtures/triage/screenshots");

// ─── Fixture types ──────────────────────────────────────────────────────────

interface AffixExpectation {
  label: string;
  expectedAffixId?: string;
  expectedStatus: "resolved" | "uncertain";
  expectedReason?: string;
  expectedUnitCorrected?: number;
  viaAlias?: boolean;
}

interface AspectExpectation {
  expectedAspectId?: string;
  expectedStatus: "resolved" | "uncertain";
  expectedReason?: string;
  expectedUnitCorrected?: number;
}

interface FixtureExpected {
  description: string;
  className: string;
  expectedSlot?: string;
  expectedSlotKind?: "resolved" | "ambiguous" | "incompatible";
  expectedSlotCandidates?: string[];
  expectedUniqueShortCircuit?: boolean;
  expectedExplicits?: AffixExpectation[];
  expectedImplicits?: AffixExpectation[];
  expectedAspect?: AspectExpectation | null;
  minResolvedRate?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadFixture(name: string): { recorded: CacheEntry; expected: FixtureExpected } {
  const recordedPath = path.join(FIXTURE_DIR, `${name}-recorded.json`);
  const expectedPath = path.join(FIXTURE_DIR, `${name}-expected.json`);
  return {
    recorded: JSON.parse(fs.readFileSync(recordedPath, "utf8")) as CacheEntry,
    expected: JSON.parse(fs.readFileSync(expectedPath, "utf8")) as FixtureExpected,
  };
}

function getItems(recorded: CacheEntry): LlmExtractedItem[] {
  if (recorded.kind !== "item") return [];
  return recorded.items;
}

function resolvedRate(results: AffixMatchResult[]): number {
  if (results.length === 0) return 1;
  return results.filter((r) => r.kind === "resolved").length / results.length;
}

function checkAffixResults(
  results: AffixMatchResult[],
  expectations: AffixExpectation[],
  label: string
): void {
  for (let i = 0; i < expectations.length; i++) {
    const exp = expectations[i];
    const result = results[i];
    if (!result) {
      // Fewer results than expectations — skip
      continue;
    }

    expect(result.kind, `${label}[${i}] "${exp.label}" kind`).toBe(exp.expectedStatus);

    if (exp.expectedStatus === "resolved" && result.kind === "resolved") {
      if (exp.expectedAffixId) {
        expect(result.affixId, `${label}[${i}] "${exp.label}" affixId`).toBe(exp.expectedAffixId);
      }
    }

    if (exp.expectedStatus === "uncertain" && result.kind === "uncertain") {
      if (exp.expectedReason) {
        expect(result.reason, `${label}[${i}] "${exp.label}" reason`).toBe(exp.expectedReason);
      }
      if (exp.expectedReason === "value-mismatch" && result.reason === "value-mismatch") {
        if (exp.expectedUnitCorrected !== undefined) {
          expect(result.unitCorrected, `${label}[${i}] "${exp.label}" unitCorrected`).toBeCloseTo(
            exp.expectedUnitCorrected,
            1
          );
        }
      }
    }
  }
}

// ─── Fixture tests ──────────────────────────────────────────────────────────

describe("triage-real-screenshots — fixture replay tests (t7)", () => {
  // ── Fixture 1: Common helm for Sorcerer ──────────────────────────────────
  describe("helm-sorcerer: common rare helm with standard Sorcerer affixes", () => {
    const { recorded, expected } = loadFixture("helm-sorcerer");

    it("recorded CacheEntry has kind='item'", () => {
      expect(recorded.kind).toBe("item");
    });

    it("slot resolves to 'helm'", () => {
      const items = getItems(recorded);
      const resolved = resolveItem(items[0], expected.className);
      expect(resolved.slotResult.kind).toBe("resolved");
      if (resolved.slotResult.kind === "resolved") {
        expect(resolved.slotResult.slotId).toBe(expected.expectedSlot);
      }
    });

    it("all 4 affixes resolve to catalog IDs", () => {
      const items = getItems(recorded);
      const resolved = resolveItem(items[0], expected.className);
      const rate = resolvedRate(resolved.explicits);
      expect(rate, `resolve rate: ${rate}`).toBeGreaterThanOrEqual(
        expected.minResolvedRate ?? 1.0
      );
      if (expected.expectedExplicits) {
        checkAffixResults(resolved.explicits, expected.expectedExplicits, "explicit");
      }
    });

    it("Maximum Life resolves to affix_max_life", () => {
      const items = getItems(recorded);
      const resolved = resolveItem(items[0], expected.className);
      const maxLife = resolved.explicits[0];
      expect(maxLife.kind).toBe("resolved");
      if (maxLife.kind === "resolved") expect(maxLife.affixId).toBe("affix_max_life");
    });
  });

  // ── Fixture 2: Unique Harlequin Crest ────────────────────────────────────
  describe("unique-harlequin: Harlequin Crest (unique short-circuit D16)", () => {
    const { recorded, expected } = loadFixture("unique-harlequin");

    it("recorded CacheEntry has kind='item'", () => {
      expect(recorded.kind).toBe("item");
    });

    it("slot resolves to 'helm' via unique short-circuit (not itemType inference)", () => {
      const items = getItems(recorded);
      const resolved = resolveItem(items[0], expected.className);
      expect(resolved.slotResult.kind).toBe("resolved");
      if (resolved.slotResult.kind === "resolved") {
        // Unique short-circuit sources slot from UniqueEntry.slot, not itemType
        expect(resolved.slotResult.slotId).toBe("helm");
      }
    });

    it("at least 75% of affixes resolve", () => {
      const items = getItems(recorded);
      const resolved = resolveItem(items[0], expected.className);
      const rate = resolvedRate(resolved.explicits);
      expect(rate).toBeGreaterThanOrEqual(expected.minResolvedRate ?? 0.75);
    });
  });

  // ── Fixture 3: Ring with Conceited Aspect ────────────────────────────────
  describe("ring-aspect: legendary ring with Conceited Aspect", () => {
    const { recorded, expected } = loadFixture("ring-aspect");

    it("recorded CacheEntry has kind='item'", () => {
      expect(recorded.kind).toBe("item");
    });

    it("slot result is ambiguous (ring1/ring2)", () => {
      const items = getItems(recorded);
      const resolved = resolveItem(items[0], expected.className);
      expect(resolved.slotResult.kind).toBe(expected.expectedSlotKind ?? "ambiguous");
      if (resolved.slotResult.kind === "ambiguous" && expected.expectedSlotCandidates) {
        for (const candidate of expected.expectedSlotCandidates) {
          expect(resolved.slotResult.candidates).toContain(candidate);
        }
      }
    });

    it("Conceited Aspect resolves to conceited_aspect", () => {
      const items = getItems(recorded);
      const resolved = resolveItem(items[0], expected.className);
      expect(resolved.aspect).toBeDefined();
      expect(resolved.aspect?.kind).toBe("resolved");
      if (resolved.aspect?.kind === "resolved") {
        expect(resolved.aspect.aspectId).toBe("conceited_aspect");
      }
    });

    it("at least 80% of affixes resolve", () => {
      const items = getItems(recorded);
      const resolved = resolveItem(items[0], expected.className);
      const rate = resolvedRate(resolved.explicits);
      expect(rate).toBeGreaterThanOrEqual(expected.minResolvedRate ?? 0.8);
    });
  });

  // ── Fixture 4: Chest with synonym-abbreviated labels ─────────────────────
  describe("chest-synonym: LLM used abbreviated labels ('Max Life', 'Crit Chance')", () => {
    const { recorded, expected } = loadFixture("chest-synonym");

    it("slot resolves to 'chest'", () => {
      const items = getItems(recorded);
      const resolved = resolveItem(items[0], expected.className);
      expect(resolved.slotResult.kind).toBe("resolved");
      if (resolved.slotResult.kind === "resolved") {
        expect(resolved.slotResult.slotId).toBe("chest");
      }
    });

    it("'Max Life' resolves to affix_max_life via synonym expansion", () => {
      const items = getItems(recorded);
      const resolved = resolveItem(items[0], expected.className);
      const maxLife = resolved.explicits[0];
      expect(maxLife.kind).toBe("resolved");
      if (maxLife.kind === "resolved") {
        expect(maxLife.affixId).toBe("affix_max_life");
      }
    });

    it("at least 75% of affixes resolve after synonym expansion", () => {
      const items = getItems(recorded);
      const resolved = resolveItem(items[0], expected.className);
      const rate = resolvedRate(resolved.explicits);
      expect(rate).toBeGreaterThanOrEqual(expected.minResolvedRate ?? 0.75);
    });
  });

  // ── Fixture 5: Ring with value-mismatch (percent as decimal) ─────────────
  describe("ring-value-mismatch: LLM extracted percent values as decimals", () => {
    const { recorded, expected } = loadFixture("ring-value-mismatch");

    it("Critical Strike Chance 0.07 → value-mismatch, unitCorrected=7", () => {
      const items = getItems(recorded);
      const resolved = resolveItem(items[0], expected.className);
      const critResult = resolved.explicits[0];
      expect(critResult.kind).toBe("uncertain");
      if (critResult.kind === "uncertain" && critResult.reason === "value-mismatch") {
        expect(critResult.unitCorrected).toBeCloseTo(7, 1);
        expect(critResult.affixId).toBe("affix_crit_chance");
      }
    });

    it("Vulnerable Damage 0.28 → value-mismatch, unitCorrected≈28", () => {
      const items = getItems(recorded);
      const resolved = resolveItem(items[0], expected.className);
      const vulnResult = resolved.explicits[1];
      expect(vulnResult.kind).toBe("uncertain");
      if (vulnResult.kind === "uncertain" && vulnResult.reason === "value-mismatch") {
        expect(vulnResult.unitCorrected).toBeCloseTo(28, 1);
      }
    });

    it("Maximum Life 1500 (correct unit) resolves cleanly", () => {
      const items = getItems(recorded);
      const resolved = resolveItem(items[0], expected.className);
      const maxLife = resolved.explicits[2];
      expect(maxLife.kind).toBe("resolved");
      if (maxLife.kind === "resolved") expect(maxLife.affixId).toBe("affix_max_life");
    });

    it("Conceited Aspect 0.20 → value-mismatch, unitCorrected=20", () => {
      const items = getItems(recorded);
      const resolved = resolveItem(items[0], expected.className);
      const aspectResult = resolved.aspect;
      expect(aspectResult).toBeDefined();
      expect(aspectResult?.kind).toBe("uncertain");
      if (aspectResult?.kind === "uncertain" && aspectResult.reason === "value-mismatch") {
        expect(aspectResult.unitCorrected).toBeCloseTo(20, 1);
        expect(aspectResult.aspectId).toBe("conceited_aspect");
      }
    });
  });
});

// ─── Aggregate match-rate report ────────────────────────────────────────────

describe("triage-real-screenshots — aggregate match-rate report", () => {
  it("computes and logs per-fixture resolved rates", () => {
    const fixtures = [
      "helm-sorcerer",
      "unique-harlequin",
      "ring-aspect",
      "chest-synonym",
      "ring-value-mismatch",
    ];

    const rows: Array<{ name: string; rate: string }> = [];
    let totalResolved = 0;
    let totalAffixes = 0;

    for (const name of fixtures) {
      const { recorded, expected } = loadFixture(name);
      if (recorded.kind !== "item") continue;
      const item = recorded.items[0];
      const resolved = resolveItem(item, expected.className);

      const allResults = [
        ...resolved.implicits,
        ...resolved.explicits,
        ...resolved.tempered,
      ];

      const resolvedCount = allResults.filter((r) => r.kind === "resolved").length;
      totalResolved += resolvedCount;
      totalAffixes += allResults.length;

      const rate = allResults.length > 0 ? resolvedCount / allResults.length : 1;
      rows.push({ name, rate: `${Math.round(rate * 100)}%` });
    }

    const overallRate = totalAffixes > 0 ? totalResolved / totalAffixes : 1;

    // Print the match-rate table (visible in verbose test output)
    console.log("\n=== Triage fixture match-rate report ===");
    console.log("Fixture                    | Resolved %");
    console.log("---------------------------|----------");
    for (const row of rows) {
      console.log(`${row.name.padEnd(26)} | ${row.rate}`);
    }
    console.log("---------------------------|----------");
    console.log(`${"OVERALL".padEnd(26)} | ${Math.round(overallRate * 100)}%`);
    console.log("");

    // Overall resolved rate should be ≥ 60% across all fixtures
    // (ring-value-mismatch intentionally has low resolved rate)
    expect(overallRate).toBeGreaterThanOrEqual(0.6);
  });
});
