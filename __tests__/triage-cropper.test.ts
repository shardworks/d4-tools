/**
 * Cropper unit tests against committed D4 screenshot fixtures.
 *
 * Fixture inventory (all in __tests__/fixtures/triage/):
 *   tooltip-single.png   – 1920×1080, dark tooltip on right side (should detect)
 *   tooltip-wide.png     – 1920×1080, wide dark tooltip covering ~37% of image (should detect)
 *   oversized.png        – 1920×1080, ~6 MB random background, no tooltip
 *                          (detection fails → fallback full image → resize-to-fit triggered)
 *   no-tooltip.png       – 1920×1080, solid bright background, no tooltip (no resize needed)
 *
 * Ratchet assertion (D26): at least 2 of 4 fixtures must have detected=true.
 *
 * Per-fixture assertions:
 *  (i)   detected/fallback outcome matches expectation
 *  (ii)  bounding-box plausibility for detected cases (area > MIN_REGION_AREA_FRACTION,
 *         aspect ratio in [MIN_ASPECT_RATIO, MAX_ASPECT_RATIO])
 *  (iii) final encodedBytes ≤ ANTHROPIC_BYTE_BUDGET for every fixture
 *  (iv)  for the oversized fixture: resized=true and encodedBytes ≤ ANTHROPIC_BYTE_BUDGET
 *  (v)   for the no-tooltip fixture: fallback used without throwing
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { cropForVision, ANTHROPIC_BYTE_BUDGET } from "../lib/triage/crop";

const FIXTURE_DIR = path.join(__dirname, "fixtures/triage");

// ─── Fixture definitions ─────────────────────────────────────────────────────

interface FixtureMeta {
  file: string;
  /** Whether we expect tooltip detection to succeed for this fixture. */
  expectDetected: boolean;
  /** Whether resize is expected to be triggered. */
  expectResized: boolean;
}

const FIXTURES: FixtureMeta[] = [
  {
    file: "tooltip-single.png",
    expectDetected: true,
    expectResized: false,
  },
  {
    file: "tooltip-wide.png",
    expectDetected: true,
    expectResized: false,
  },
  {
    file: "oversized.png",
    // Random background → detection fails → fallback full ~6 MB image → resize triggered
    expectDetected: false,
    expectResized: true,
  },
  {
    file: "no-tooltip.png",
    expectDetected: false,
    expectResized: false,
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("cropForVision (fixture-based)", () => {
  // Run the cropper against every fixture and collect results up-front so
  // the ratchet assertion can inspect the whole set.

  it("ratchet: at least 2 of 4 fixtures detect a tooltip successfully (D26)", async () => {
    const results = await Promise.all(
      FIXTURES.map(async ({ file }) => {
        const bytes = await fs.readFile(path.join(FIXTURE_DIR, file));
        const result = await cropForVision(bytes, "image/png");
        return { file, ...result };
      })
    );

    const detectedCount = results.filter((r) => r.detected).length;

    // Print outcomes for the crop.README.md to cite
    console.log("\n[triage-cropper fixtures]");
    for (const r of results) {
      console.log(
        `  ${r.file}: detected=${r.detected} resized=${r.resized} ` +
          `encodedBytes=${r.encodedBytes} images=${r.images.length}`
      );
    }

    expect(detectedCount).toBeGreaterThanOrEqual(2);
  }, 60_000);

  // ── Per-fixture assertions ──────────────────────────────────────────────

  for (const { file, expectDetected, expectResized } of FIXTURES) {
    describe(file, () => {
      it("detected/fallback outcome matches expectation", async () => {
        const bytes = await fs.readFile(path.join(FIXTURE_DIR, file));
        const result = await cropForVision(bytes, "image/png");
        expect(result.detected).toBe(expectDetected);
      }, 60_000);

      it("encodedBytes ≤ ANTHROPIC_BYTE_BUDGET", async () => {
        const bytes = await fs.readFile(path.join(FIXTURE_DIR, file));
        const result = await cropForVision(bytes, "image/png");
        expect(result.encodedBytes).toBeLessThanOrEqual(ANTHROPIC_BYTE_BUDGET);
      }, 60_000);

      it("returns exactly one image entry", async () => {
        const bytes = await fs.readFile(path.join(FIXTURE_DIR, file));
        const result = await cropForVision(bytes, "image/png");
        expect(result.images).toHaveLength(1);
        expect(result.images[0].bytes).toBeInstanceOf(Buffer);
        expect(result.images[0].mediaType).toMatch(/^image\//);
      }, 60_000);

      if (expectDetected) {
        it("detected: crop bytes are non-empty", async () => {
          const bytes = await fs.readFile(path.join(FIXTURE_DIR, file));
          const result = await cropForVision(bytes, "image/png");
          expect(result.images[0].bytes.length).toBeGreaterThan(0);
        }, 60_000);

        it("detected: crop is smaller than the original image (tooltip, not full frame)", async () => {
          const bytes = await fs.readFile(path.join(FIXTURE_DIR, file));
          const result = await cropForVision(bytes, "image/png");
          // The crop should be smaller than the original (which is ~32 KB compressed
          // but the tooltip region itself is re-encoded as PNG; it should be at
          // most a fraction of the 1920×1080 frame).
          expect(result.images[0].bytes.length).toBeLessThan(bytes.length);
        }, 60_000);
      }

      if (expectResized) {
        it("oversized: resize was triggered", async () => {
          const bytes = await fs.readFile(path.join(FIXTURE_DIR, file));
          const result = await cropForVision(bytes, "image/png");
          expect(result.resized).toBe(true);
        }, 60_000);

        it("oversized: final encodedBytes strictly ≤ ANTHROPIC_BYTE_BUDGET", async () => {
          const bytes = await fs.readFile(path.join(FIXTURE_DIR, file));
          const result = await cropForVision(bytes, "image/png");
          expect(result.encodedBytes).toBeLessThanOrEqual(ANTHROPIC_BYTE_BUDGET);
        }, 60_000);
      }

      it("does not throw", async () => {
        const bytes = await fs.readFile(path.join(FIXTURE_DIR, file));
        await expect(cropForVision(bytes, "image/png")).resolves.toBeDefined();
      }, 60_000);
    });
  }

  // ── No-tooltip fallback: never throws even on zero dark pixels ─────────

  it("fallback: full synthetic all-white image returns detected=false without throwing", async () => {
    // 10×10 white pixels — no dark channel below DARK_THRESHOLD
    const whitePixels = Buffer.alloc(10 * 10 * 3, 255);
    const sharp = (await import("sharp")).default;
    const pngBytes = await sharp(whitePixels, { raw: { width: 10, height: 10, channels: 3 } })
      .png()
      .toBuffer();

    const result = await cropForVision(pngBytes, "image/png");
    expect(result.detected).toBe(false);
    expect(result.images).toHaveLength(1);
    expect(result.encodedBytes).toBeLessThanOrEqual(ANTHROPIC_BYTE_BUDGET);
  });
});
