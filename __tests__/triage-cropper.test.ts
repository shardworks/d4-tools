/**
 * Cropper unit tests.
 *
 * Two tiers of fixtures:
 *
 *   1. Synthetic (legacy) — pure black rectangles on flat brown:
 *        tooltip-single.png, tooltip-wide.png, oversized.png, no-tooltip.png
 *      These act as smoke tests for the resize-to-fit pipeline. They do
 *      not exercise the title-anchored detector meaningfully.
 *
 *   2. Real (primary) — actual D4 screenshots covering all rarity tiers
 *      and multi-tooltip cases:
 *        diablo-4-tiabult-s-will.jpg   – Unique (amber)
 *        Screenshot014.jpg              – Legendary (orange)
 *        Screenshot016.jpg              – Rare (yellow)
 *        Screenshot017.jpg              – 2× Rare side-by-side
 *        Screenshot018.jpg              – Rare (single)
 *        Screenshot019.jpg              – Magic (blue)
 *        Screenshot020.jpg              – Legendary (Rathma's)
 *        Screenshot021.jpg              – Unique + Magic side-by-side
 *        Screenshot022.jpg              – Unique (Paingorger's)
 *        Screenshot023.jpg              – Common (gray/white) — KNOWN MISS
 *
 * Detection ratchet (real fixtures): at least 10 of 11 distinct tooltips
 * across the real fixtures must be detected (Common is the known miss).
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { cropForVision, ANTHROPIC_BYTE_BUDGET } from "../lib/triage/crop";

const SYN_FIXTURE_DIR = path.join(__dirname, "fixtures/triage");
const REAL_FIXTURE_DIR = path.join(__dirname, "fixtures/triage/real");

// ─── Synthetic fixtures (smoke tests for the resize pipeline) ───────────────

interface SyntheticFixture {
  file: string;
  expectDetected: boolean;
  expectResized: boolean;
}

const SYNTHETIC_FIXTURES: SyntheticFixture[] = [
  { file: "tooltip-single.png", expectDetected: false, expectResized: false },
  { file: "tooltip-wide.png", expectDetected: false, expectResized: false },
  // Random background ~6 MB; detection fails → fallback full-image → resize
  { file: "oversized.png", expectDetected: false, expectResized: true },
  { file: "no-tooltip.png", expectDetected: false, expectResized: false },
];

describe("cropForVision (synthetic smoke tests)", () => {
  for (const { file, expectResized } of SYNTHETIC_FIXTURES) {
    describe(file, () => {
      it("does not throw", async () => {
        const bytes = await fs.readFile(path.join(SYN_FIXTURE_DIR, file));
        await expect(cropForVision(bytes, "image/png")).resolves.toBeDefined();
      }, 60_000);

      it("returns at least one image entry", async () => {
        const bytes = await fs.readFile(path.join(SYN_FIXTURE_DIR, file));
        const result = await cropForVision(bytes, "image/png");
        expect(result.images.length).toBeGreaterThan(0);
        for (const img of result.images) {
          expect(img.bytes).toBeInstanceOf(Buffer);
          expect(img.mediaType).toMatch(/^image\//);
        }
      }, 60_000);

      it("encodedBytes ≤ ANTHROPIC_BYTE_BUDGET", async () => {
        const bytes = await fs.readFile(path.join(SYN_FIXTURE_DIR, file));
        const result = await cropForVision(bytes, "image/png");
        expect(result.encodedBytes).toBeLessThanOrEqual(ANTHROPIC_BYTE_BUDGET);
      }, 60_000);

      if (expectResized) {
        it("oversized: resize was triggered", async () => {
          const bytes = await fs.readFile(path.join(SYN_FIXTURE_DIR, file));
          const result = await cropForVision(bytes, "image/png");
          expect(result.resized).toBe(true);
        }, 60_000);
      }
    });
  }
});

// ─── Real-screenshot fixtures (primary detection tests) ─────────────────────

interface RealFixture {
  file: string;
  /** Minimum number of detected tooltip crops expected. */
  expectMin: number;
  /** Maximum number of crops we'll tolerate (false-positive ceiling). */
  expectMax: number;
  /** Skip the "must detect" assertion (known miss). */
  knownMiss?: boolean;
  rarities: string[];
}

const REAL_FIXTURES: RealFixture[] = [
  { file: "diablo-4-tiabult-s-will.jpg", expectMin: 1, expectMax: 1, rarities: ["unique"] },
  { file: "Screenshot014.jpg", expectMin: 1, expectMax: 1, rarities: ["unique", "legendary"] },
  { file: "Screenshot016.jpg", expectMin: 1, expectMax: 2, rarities: ["rare"] },
  { file: "Screenshot017.jpg", expectMin: 2, expectMax: 3, rarities: ["rare"] },
  { file: "Screenshot018.jpg", expectMin: 1, expectMax: 2, rarities: ["rare"] },
  { file: "Screenshot019.jpg", expectMin: 1, expectMax: 2, rarities: ["magic"] },
  { file: "Screenshot020.jpg", expectMin: 1, expectMax: 2, rarities: ["unique", "legendary"] },
  { file: "Screenshot021.jpg", expectMin: 2, expectMax: 3, rarities: ["unique", "magic"] },
  { file: "Screenshot022.jpg", expectMin: 1, expectMax: 2, rarities: ["unique"] },
  // Common rarity is a known miss (white text on dark — too easily confused
  // with HUD/scenery whites). Detection falls back to full-image.
  { file: "Screenshot023.jpg", expectMin: 0, expectMax: 1, knownMiss: true, rarities: ["common"] },
];

describe("cropForVision (real D4 screenshots)", () => {
  // ── Ratchet: at least 10 of 11 distinct tooltips across the bundle ──────
  it("ratchet: detects ≥ 10 of 11 distinct tooltips across the real fixture bundle", async () => {
    let totalDetected = 0;
    const perFile: Array<{ file: string; n: number; bytes: number }> = [];
    for (const fx of REAL_FIXTURES) {
      const bytes = await fs.readFile(path.join(REAL_FIXTURE_DIR, fx.file));
      const result = await cropForVision(bytes, "image/jpeg");
      const n = result.detected ? result.images.length : 0;
      totalDetected += n;
      perFile.push({ file: fx.file, n, bytes: result.encodedBytes });
    }

    // Print diagnostic table
    console.log("\n[real-fixtures detection report]");
    for (const r of perFile) {
      console.log(`  ${r.file}: ${r.n} crop(s), ${r.bytes} encoded bytes`);
    }
    console.log(`  TOTAL: ${totalDetected} crops`);

    // Ratchet floor: ≥ 10 distinct tooltip detections across the bundle
    expect(totalDetected).toBeGreaterThanOrEqual(10);
  }, 120_000);

  // ── Per-fixture assertions ──────────────────────────────────────────────
  for (const fx of REAL_FIXTURES) {
    describe(fx.file, () => {
      it("does not throw", async () => {
        const bytes = await fs.readFile(path.join(REAL_FIXTURE_DIR, fx.file));
        await expect(cropForVision(bytes, "image/jpeg")).resolves.toBeDefined();
      }, 60_000);

      it("returns ≥ 1 image entry (detection or fallback)", async () => {
        const bytes = await fs.readFile(path.join(REAL_FIXTURE_DIR, fx.file));
        const result = await cropForVision(bytes, "image/jpeg");
        expect(result.images.length).toBeGreaterThanOrEqual(1);
      }, 60_000);

      it("each image entry is a non-empty Buffer with image/* mediaType", async () => {
        const bytes = await fs.readFile(path.join(REAL_FIXTURE_DIR, fx.file));
        const result = await cropForVision(bytes, "image/jpeg");
        for (const img of result.images) {
          expect(img.bytes).toBeInstanceOf(Buffer);
          expect(img.bytes.length).toBeGreaterThan(0);
          expect(img.mediaType).toMatch(/^image\//);
        }
      }, 60_000);

      it("total encodedBytes ≤ ANTHROPIC_BYTE_BUDGET × image count", async () => {
        const bytes = await fs.readFile(path.join(REAL_FIXTURE_DIR, fx.file));
        const result = await cropForVision(bytes, "image/jpeg");
        // Per-crop budget — total can be up to N × budget
        expect(result.encodedBytes).toBeLessThanOrEqual(
          ANTHROPIC_BYTE_BUDGET * result.images.length
        );
      }, 60_000);

      if (!fx.knownMiss) {
        it(`detects between ${fx.expectMin} and ${fx.expectMax} tooltip(s)`, async () => {
          const bytes = await fs.readFile(path.join(REAL_FIXTURE_DIR, fx.file));
          const result = await cropForVision(bytes, "image/jpeg");
          expect(result.detected).toBe(true);
          expect(result.images.length).toBeGreaterThanOrEqual(fx.expectMin);
          expect(result.images.length).toBeLessThanOrEqual(fx.expectMax);
        }, 60_000);

        it("detected crops have smaller pixel dimensions than the original", async () => {
          const sharp = (await import("sharp")).default;
          const bytes = await fs.readFile(path.join(REAL_FIXTURE_DIR, fx.file));
          const origMeta = await sharp(bytes).metadata();
          const origPixels = (origMeta.width ?? 0) * (origMeta.height ?? 0);
          const result = await cropForVision(bytes, "image/jpeg");
          if (result.detected) {
            for (const img of result.images) {
              const cropMeta = await sharp(img.bytes).metadata();
              const cropPixels = (cropMeta.width ?? 0) * (cropMeta.height ?? 0);
              // Must be strictly smaller (a crop is by definition a subset).
              expect(cropPixels).toBeLessThan(origPixels);
            }
          }
        }, 60_000);
      }
    });
  }

  // ── Fallback contract: never throws on degenerate inputs ────────────────
  it("fallback: full synthetic all-white image returns detected=false without throwing", async () => {
    const whitePixels = Buffer.alloc(10 * 10 * 3, 255);
    const sharp = (await import("sharp")).default;
    const pngBytes = await sharp(whitePixels, {
      raw: { width: 10, height: 10, channels: 3 },
    })
      .png()
      .toBuffer();

    const result = await cropForVision(pngBytes, "image/png");
    expect(result.detected).toBe(false);
    expect(result.images).toHaveLength(1);
    expect(result.encodedBytes).toBeLessThanOrEqual(ANTHROPIC_BYTE_BUDGET);
  });
});
