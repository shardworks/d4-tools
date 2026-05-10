/**
 * Generates synthetic D4 screenshot fixtures for the triage cropper tests.
 *
 * Run once with:  pnpm tsx tools/generate-triage-fixtures.ts
 *
 * Produces four PNG files in __tests__/fixtures/triage/:
 *
 * 1. tooltip-single.png  (1920×1080, ~32 KB)
 *    Solid warm-gray game background with a single dark tooltip region on the
 *    right side (x: 1380–1820, y: 140–800). Compresses well → small file.
 *    Expected outcome: detected=true, resized=false.
 *
 * 2. tooltip-wide.png  (1920×1080, ~50 KB)
 *    Solid game background with a wide tooltip covering a larger area
 *    (x: 600–1820, y: 200–860). Tests detection on a different region shape.
 *    Expected outcome: detected=true, resized=false.
 *
 * 3. oversized.png  (1920×1080, ~6 MB)
 *    All background pixels are pseudo-random in [80, 255] — well above
 *    DARK_THRESHOLD (60), so no tooltip is detectable. PNG can barely compress
 *    random data → file exceeds 5 MB → exercises the resize-to-fit fallback path.
 *    Expected outcome: detected=false (full-image fallback), resized=true.
 *
 * 4. no-tooltip.png  (1920×1080, ~31 KB)
 *    Solid bright background, no dark pixels below DARK_THRESHOLD.
 *    Expected outcome: detected=false, resized=false.
 */

import sharp from "sharp";
import { rm } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.join(__dirname, "../__tests__/fixtures/triage");

const W = 1920;
const H = 1080;
const CHANNELS = 3; // RGB

// D4 tooltip background color (near-black brownish)
const TT_R = 18;
const TT_G = 14;
const TT_B = 9;

/** Simple deterministic LCG pseudo-random for reproducible noise. */
function makeLcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 4294967296;
  };
}

/** tooltip-single.png: right-side tooltip panel. */
async function makeFixture1(): Promise<void> {
  const TT_LEFT = 1380, TT_TOP = 140, TT_RIGHT = 1820, TT_BOTTOM = 800;
  const pixels = Buffer.alloc(W * H * CHANNELS);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * CHANNELS;
      const inTip = x >= TT_LEFT && x < TT_RIGHT && y >= TT_TOP && y < TT_BOTTOM;
      pixels[i]     = inTip ? TT_R : 110;
      pixels[i + 1] = inTip ? TT_G : 95;
      pixels[i + 2] = inTip ? TT_B : 75;
    }
  }
  await sharp(pixels, { raw: { width: W, height: H, channels: CHANNELS } })
    .png()
    .toFile(path.join(outDir, "tooltip-single.png"));
  console.log("✓ tooltip-single.png");
}

/** tooltip-wide.png: wide tooltip covering ~37% of the image area. */
async function makeFixture2(): Promise<void> {
  const TT_LEFT = 600, TT_TOP = 200, TT_RIGHT = 1820, TT_BOTTOM = 860;
  const pixels = Buffer.alloc(W * H * CHANNELS);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * CHANNELS;
      const inTip = x >= TT_LEFT && x < TT_RIGHT && y >= TT_TOP && y < TT_BOTTOM;
      pixels[i]     = inTip ? TT_R : 120;
      pixels[i + 1] = inTip ? TT_G : 100;
      pixels[i + 2] = inTip ? TT_B : 80;
    }
  }
  await sharp(pixels, { raw: { width: W, height: H, channels: CHANNELS } })
    .png()
    .toFile(path.join(outDir, "tooltip-wide.png"));
  console.log("✓ tooltip-wide.png");
}

/**
 * oversized.png: no tooltip, random background that compresses poorly.
 * All background values in [80, 255] → never dark → detection fails →
 * fallback full image → resize-to-fit is triggered.
 */
async function makeFixture3(): Promise<void> {
  const rand = makeLcg(0xdeadbeef);
  const pixels = Buffer.alloc(W * H * CHANNELS);
  for (let i = 0; i < W * H * CHANNELS; i++) {
    // [80, 255] — always above DARK_THRESHOLD (60)
    pixels[i] = 80 + Math.round(rand() * 175);
  }
  const outPath = path.join(outDir, "oversized.png");
  await sharp(pixels, { raw: { width: W, height: H, channels: CHANNELS } })
    .png({ compressionLevel: 0 }) // disable compression → large file
    .toFile(outPath);
  const statBuf = await import("fs/promises").then(m => m.stat(outPath));
  console.log(`✓ oversized.png (${(statBuf.size / 1_000_000).toFixed(1)} MB)`);
}

/** no-tooltip.png: solid bright background, no dark pixels. */
async function makeFixture4(): Promise<void> {
  const pixels = Buffer.alloc(W * H * CHANNELS);
  for (let i = 0; i < W * H * CHANNELS; i += CHANNELS) {
    pixels[i]     = 140;
    pixels[i + 1] = 180;
    pixels[i + 2] = 160;
  }
  await sharp(pixels, { raw: { width: W, height: H, channels: CHANNELS } })
    .png()
    .toFile(path.join(outDir, "no-tooltip.png"));
  console.log("✓ no-tooltip.png");
}

async function main(): Promise<void> {
  console.log(`Generating fixtures → ${outDir}`);
  // Remove old tooltip-oversized.png if it exists from a previous run
  await rm(path.join(outDir, "tooltip-oversized.png"), { force: true });
  await makeFixture1();
  await makeFixture2();
  await makeFixture3();
  await makeFixture4();
  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
