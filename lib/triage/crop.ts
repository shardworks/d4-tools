/**
 * Server-side tooltip detector and cropper for D4 screenshots.
 *
 * The detector is **title-anchored, frame-color-aware**. The most reliable
 * signal a D4 tooltip provides is its title text: rarity-colored letters
 * rendered on a dark background. The pipeline:
 *
 *   1. Downscale to DETECT_MAX_SIDE for the heuristic loop.
 *   2. Per-pixel: classify as `dark` (interior candidate) and per-rarity
 *      "frame-color" (HSV ranges per rarity tier).
 *   3. Filter rarity pixels to "dark-context" (have ≥3 dark neighbors above
 *      or below within y±2..±12) — eliminates the bulk of false positives
 *      (cobblestones, character armor, sky).
 *   4. For each row, find long horizontal runs of dark-context rarity
 *      pixels — these are title rows.
 *   5. Cluster row hits into per-tooltip title clusters (y-adjacency +
 *      x-overlap).
 *   6. Merge clusters bridged by dark-dominant gaps (handles the same
 *      tooltip producing multiple colored runs across body affixes).
 *   7. For each cluster, body-trace UP and DOWN through dark-dominant rows
 *      (combined criterion: dark fraction ≥ BODY_DARK_FRACTION OR longest
 *      dark run ≥ BODY_DARK_RUN_FRACTION × bbox width).
 *   8. Refine horizontal bbox via per-column dark fraction over the body
 *      y-range, capped to ±HORIZONTAL_EXT_CAP_FRAC × titleWidth.
 *   9. Filter (size, body dark, aspect, area). NMS by area: drop bboxes
 *      mostly contained in larger ones.
 *  10. Map back to full resolution with small padding; crop each detected
 *      region.
 *  11. Per-crop independent resize-to-fit ANTHROPIC_BYTE_BUDGET (PNG, then
 *      JPEG iterative downscale).
 *
 * Multi-tooltip support is natural — each title cluster yields one bbox.
 *
 * On any failure (no tooltip found, sharp throws), the pipeline falls back
 * to a single full-image entry, post-resize. Failure is logged but never
 * surfaced to the user.
 *
 * The cropper is NOT called on cache hits. It is invoked in the route
 * handler, NOT inside extractItemsFromImage. The on-disk original at
 * ${SCREENSHOT_DIR}/<filename> is never modified — the cropper is
 * memory-only. Metadata is stripped by default. Per-crop budgets are
 * independent; no joint budget is applied across images.
 *
 * KNOWN LIMITATION: Common-rarity tooltips (white title text on dark) have
 * weak chromatic signal and are easily confused with bright HUD/text/sky
 * pixels. Detection of Common items is best-effort; the fallback is full-
 * image. All chromatic rarities (Magic, Rare, Legendary, Unique) detect
 * reliably across the bundled fixture set.
 */

import sharp from "sharp";
import type { SupportedImageMediaType } from "./types";

// ─── Tunables ────────────────────────────────────────────────────────────────

/**
 * Anthropic per-image base64 byte budget. Sits ~240 KB below the documented
 * 5,242,880-byte limit to absorb envelope overhead (JSON framing, tool-use
 * schema, text block).
 */
export const ANTHROPIC_BYTE_BUDGET = 5_000_000;

/**
 * Longer edge (in pixels) of the downscaled working copy used for detection.
 * Heuristic accuracy is stable at this size; larger values waste CPU without
 * improving title-text run detection quality.
 */
export const DETECT_MAX_SIDE = 960;

/**
 * Luminance threshold (0..255) below which a pixel is classified as dark
 * (a tooltip-interior candidate). BT.601 luma weighting is used.
 */
export const DARK_LUM_MAX = 60;

/**
 * Body trace stops when both row criteria fail for this many consecutive
 * rows. Each row passes if (dark fraction ≥ BODY_DARK_FRACTION) OR (longest
 * dark run ≥ BODY_DARK_RUN_FRACTION × bbox width).
 */
export const TRACE_NONQUAL_STREAK = 4;

/** Per-row dark-fraction threshold inside the title's x-range during trace. */
export const BODY_DARK_FRACTION = 0.40;

/** Per-row longest-dark-run threshold (as fraction of bbox width). */
export const BODY_DARK_RUN_FRACTION = 0.50;

/** Detection-frame pixel padding added to the title cluster's x-range. */
export const HORIZONTAL_PAD = 8;

/** Cap on horizontal bbox extension during left/right edge refinement. */
export const HORIZONTAL_EXT_CAP_FRAC = 1.0;

/** Per-column dark-fraction threshold during horizontal extension. */
export const HORIZONTAL_EXT_COL_DARK = 0.70;

/** Minimum total title-run length (sum across cluster rows) to consider. */
export const MIN_TITLE_LEN_TOTAL = 130;

/** Cluster-merge participants must each have at least this total length. */
export const MIN_CLUSTER_LEN_FOR_MERGE = 130;

/** Minimum bbox height (detect-pixel rows) to accept as a tooltip. */
export const MIN_BBOX_HEIGHT = 80;

/** Padding fraction added around each detected bbox before cropping. */
export const CROP_PADDING_FRACTION = 0.04;

/**
 * Inventory-side filter: clusters whose left edge is closer than this many
 * detect-pixels to the screen's left edge are usually inventory-pane lock
 * icons rather than floating tooltips. They need a stronger title signal
 * to be accepted.
 */
export const NEAR_LEFT_EDGE = 30;

/**
 * Title-len threshold for clusters in the inventory side strip — must
 * exceed this to be accepted as a tooltip.
 */
export const NEAR_LEFT_EDGE_MIN_TITLE_LEN = 350;

/**
 * Bottom-strip filter: clusters at y > BOTTOM_STRIP_FRAC × H with title-len
 * below BOTTOM_STRIP_MIN_TITLE_LEN are usually "Equip / Drop / Compare"
 * key-hint footers, not tooltips.
 */
export const BOTTOM_STRIP_FRAC = 0.85;
export const BOTTOM_STRIP_MIN_TITLE_LEN = 250;

/** JPEG quality used for the resize-to-fit fallback. */
export const JPEG_FALLBACK_QUALITY = 85;

// ─── Rarity color ranges (HSV; H in 0..360°, S/V in 0..1) ────────────────────

/**
 * Per-rarity HSV match function. The frame mask (and title-text mask) is the
 * union of all rarities — we don't need to identify which rarity matched in
 * order to crop, but the rarity is recorded for diagnostics.
 *
 * Ranges were tuned against the bundled D4 screenshot fixture set:
 *   - Common  → low-saturation white-ish (most permissive; still misses
 *               many real Common tooltips because white is everywhere)
 *   - Magic   → blue (cyan-ward), hue ~195–245°
 *   - Rare    → yellow, hue ~45–70°
 *   - Legend. → orange, hue ~22–45°
 *   - Unique  → amber/rust, hue ~15–35°, slightly less bright than legendary
 */
export const RARITY_RANGES: Array<{
  name: string;
  match: (h: number, s: number, v: number) => boolean;
}> = [
  { name: "common", match: (_h, s, v) => s < 0.22 && v > 0.70 },
  { name: "magic", match: (h, s, v) => h >= 195 && h <= 245 && s > 0.25 && v > 0.40 },
  { name: "rare", match: (h, s, v) => h >= 45 && h <= 70 && s > 0.45 && v > 0.55 },
  { name: "legendary", match: (h, s, v) => h >= 22 && h <= 45 && s > 0.50 && v > 0.50 },
  { name: "unique", match: (h, s, v) => h >= 15 && h <= 35 && s > 0.45 && v > 0.40 && v < 0.85 },
];

// ─── Result type ─────────────────────────────────────────────────────────────

/**
 * Result of the crop pipeline. Consumed by route handlers and passed
 * verbatim to extractItemsFromImage.
 */
export interface CropResult {
  /**
   * One entry per detected tooltip region. May contain multiple entries for
   * screenshots with multiple visible tooltips (e.g., comparison views).
   * On detection failure, falls back to a single full-image entry.
   */
  images: Array<{ bytes: Buffer; mediaType: SupportedImageMediaType }>;
  /** true if at least one tooltip was detected; false if full-image fallback. */
  detected: boolean;
  /** true if any image was downscaled to satisfy ANTHROPIC_BYTE_BUDGET. */
  resized: boolean;
  /** Total base64-encoded byte count across all images. */
  encodedBytes: number;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function analyticalBase64Size(rawBytes: number): number {
  return Math.ceil(rawBytes / 3) * 4;
}

function rgbToHsv(r: number, g: number, b: number) {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const mx = Math.max(rf, gf, bf);
  const mn = Math.min(rf, gf, bf);
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === rf) h = 60 * (((gf - bf) / d) % 6);
    else if (mx === gf) h = 60 * ((bf - rf) / d + 2);
    else h = 60 * ((rf - gf) / d + 4);
  }
  if (h < 0) h += 360;
  const s = mx === 0 ? 0 : d / mx;
  return { h, s, v: mx };
}

const MAX_RUN_GAP = 5;

/**
 * Longest dark run in row y over [xL..xR], allowing maxGap non-dark pixels
 * inside a run. Returns length + run extent.
 */
function longestDarkRun(
  dark: Uint8Array,
  W: number,
  y: number,
  xL: number,
  xR: number,
  maxGap: number
): { length: number; left: number; right: number } {
  let bestLen = 0;
  let bestL = 0;
  let bestR = -1;
  let curStart = -1;
  let curEnd = -1;
  let gap = 0;
  for (let x = xL; x <= xR; x++) {
    if (dark[y * W + x]) {
      if (curStart < 0) curStart = x;
      curEnd = x;
      gap = 0;
    } else if (curStart >= 0) {
      gap++;
      if (gap > maxGap) {
        const len = curEnd - curStart + 1;
        if (len > bestLen) {
          bestLen = len;
          bestL = curStart;
          bestR = curEnd;
        }
        curStart = -1;
        curEnd = -1;
        gap = 0;
      }
    }
  }
  if (curStart >= 0) {
    const len = curEnd - curStart + 1;
    if (len > bestLen) {
      bestLen = len;
      bestL = curStart;
      bestR = curEnd;
    }
  }
  return { length: bestLen, left: bestL, right: bestR };
}

function darkFractionInRange(
  dark: Uint8Array,
  W: number,
  y: number,
  xL: number,
  xR: number
): number {
  let count = 0;
  for (let x = xL; x <= xR; x++) {
    if (dark[y * W + x]) count++;
  }
  return count / Math.max(1, xR - xL + 1);
}

interface BBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Detection extends BBox {
  rarity: string;
  titleY: number;
  titleLen: number;
  bodyDarkFrac: number;
}

/**
 * Detection entry point: returns 0..N tooltip bboxes in DETECT-frame
 * coordinates. Caller maps back to full resolution.
 */
function detectTooltips(
  data: Buffer,
  W: number,
  H: number,
  C: number
): Detection[] {
  const N = W * H;

  // 1. Per-pixel classification
  const dark = new Uint8Array(N);
  const colorPerRarity: Record<string, Uint8Array> = {};
  for (const r of RARITY_RANGES) colorPerRarity[r.name] = new Uint8Array(N);

  for (let i = 0; i < N; i++) {
    const p = i * C;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const L = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
    if (L < DARK_LUM_MAX) dark[i] = 1;
    const { h, s, v } = rgbToHsv(r, g, b);
    for (const range of RARITY_RANGES) {
      if (range.match(h, s, v)) colorPerRarity[range.name][i] = 1;
    }
  }

  // 2. Dark-context filter (bounds-aware)
  const Y_NB_NEAR = 2;
  const Y_NB_FAR = 12;
  const dcPerRarity: Record<string, Uint8Array> = {};
  for (const r of RARITY_RANGES) {
    const src = colorPerRarity[r.name];
    const dst = new Uint8Array(N);
    const minNb = r.name === "common" ? 4 : 3;
    for (let y = 0; y < H; y++) {
      const canCheckAbove = y - Y_NB_NEAR >= 0;
      const canCheckBelow = y + Y_NB_NEAR <= H - 1;
      if (!canCheckAbove && !canCheckBelow) continue;
      const aboveLo = Math.max(0, y - Y_NB_FAR);
      const aboveHi = Math.max(0, y - Y_NB_NEAR);
      const belowLo = Math.min(H - 1, y + Y_NB_NEAR);
      const belowHi = Math.min(H - 1, y + Y_NB_FAR);
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!src[i]) continue;
        let above = 0;
        let below = 0;
        if (canCheckAbove) {
          for (let yy = aboveLo; yy <= aboveHi; yy++) {
            if (dark[yy * W + x]) above++;
          }
        }
        if (canCheckBelow) {
          for (let yy = belowLo; yy <= belowHi; yy++) {
            if (dark[yy * W + x]) below++;
          }
        }
        if (r.name === "common") {
          // Stricter for common: AND when both sides checkable
          if (canCheckAbove && canCheckBelow) {
            if (above >= minNb && below >= minNb) dst[i] = 1;
          } else if (canCheckBelow && below >= minNb) {
            dst[i] = 1;
          } else if (canCheckAbove && above >= minNb) {
            dst[i] = 1;
          }
        } else {
          if (above >= minNb || below >= minNb) dst[i] = 1;
        }
      }
    }
    dcPerRarity[r.name] = dst;
  }

  // 3. Per-row long runs of dark-context rarity pixels
  const MIN_TITLE_RUN = Math.max(35, Math.round(W * 0.04));
  interface RowHit {
    y: number;
    rarity: string;
    length: number;
    left: number;
    right: number;
  }
  const rowHits: RowHit[] = [];
  for (const range of RARITY_RANGES) {
    const m = dcPerRarity[range.name];
    for (let y = 0; y < H; y++) {
      const rr = longestDarkRun(m, W, y, 0, W - 1, MAX_RUN_GAP);
      if (rr.length >= MIN_TITLE_RUN) {
        rowHits.push({ y, rarity: range.name, length: rr.length, left: rr.left, right: rr.right });
      }
    }
  }
  rowHits.sort((a, b) => a.y - b.y);

  // 4. Cluster row hits
  interface Cluster {
    yMin: number;
    yMax: number;
    xMin: number;
    xMax: number;
    rarity: string;
    rarityLengths: Record<string, number>;
    totalLength: number;
  }
  const clusters: Cluster[] = [];
  for (const hit of rowHits) {
    let bestC: Cluster | null = null;
    let bestOverlap = 0;
    for (const c of clusters) {
      if (hit.y - c.yMax > 4) continue;
      const overlap = Math.max(0, Math.min(c.xMax, hit.right) - Math.max(c.xMin, hit.left));
      const minSpan = Math.min(c.xMax - c.xMin, hit.right - hit.left);
      if (minSpan === 0) continue;
      const ratio = overlap / minSpan;
      if (ratio < 0.5) continue;
      if (ratio > bestOverlap) {
        bestOverlap = ratio;
        bestC = c;
      }
    }
    if (bestC) {
      bestC.yMax = Math.max(bestC.yMax, hit.y);
      bestC.xMin = Math.min(bestC.xMin, hit.left);
      bestC.xMax = Math.max(bestC.xMax, hit.right);
      bestC.rarityLengths[hit.rarity] = (bestC.rarityLengths[hit.rarity] || 0) + hit.length;
      bestC.totalLength += hit.length;
      let r = bestC.rarity;
      let L = bestC.rarityLengths[r] || 0;
      for (const [rr, ll] of Object.entries(bestC.rarityLengths)) {
        if (ll > L) {
          L = ll;
          r = rr;
        }
      }
      bestC.rarity = r;
    } else {
      clusters.push({
        yMin: hit.y,
        yMax: hit.y,
        xMin: hit.left,
        xMax: hit.right,
        rarity: hit.rarity,
        rarityLengths: { [hit.rarity]: hit.length },
        totalLength: hit.length,
      });
    }
  }

  // 5. Merge clusters bridged by dark-dominant rows. Iterates to fixed point.
  const mergedClusters: Cluster[] = clusters.map((c) => ({
    ...c,
    rarityLengths: { ...c.rarityLengths },
  }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < mergedClusters.length; i++) {
      for (let j = i + 1; j < mergedClusters.length; j++) {
        const a = mergedClusters[i];
        const b = mergedClusters[j];
        if (a.totalLength < MIN_CLUSTER_LEN_FOR_MERGE || b.totalLength < MIN_CLUSTER_LEN_FOR_MERGE) {
          continue;
        }
        const overlap = Math.max(0, Math.min(a.xMax, b.xMax) - Math.max(a.xMin, b.xMin));
        const minSpan = Math.min(a.xMax - a.xMin, b.xMax - b.xMin);
        if (minSpan <= 0) continue;
        if (overlap / minSpan < 0.5) continue;

        const upper = a.yMax < b.yMin ? a : b.yMax < a.yMin ? b : null;
        let mergeIt = false;
        if (upper === null) {
          mergeIt = true;
        } else {
          const lower = upper === a ? b : a;
          const gapStart = upper.yMax + 1;
          const gapEnd = lower.yMin - 1;
          if (gapEnd - gapStart + 1 > 350) continue;
          const xL = Math.max(a.xMin, b.xMin);
          const xR = Math.min(a.xMax, b.xMax);
          let darkSum = 0;
          let cells = 0;
          for (let y = gapStart; y <= gapEnd; y++) {
            for (let x = xL; x <= xR; x++) {
              cells++;
              if (dark[y * W + x]) darkSum++;
            }
          }
          const frac = cells > 0 ? darkSum / cells : 0;
          if (frac >= 0.55) mergeIt = true;
        }
        if (mergeIt) {
          a.yMin = Math.min(a.yMin, b.yMin);
          a.yMax = Math.max(a.yMax, b.yMax);
          a.xMin = Math.min(a.xMin, b.xMin);
          a.xMax = Math.max(a.xMax, b.xMax);
          a.totalLength += b.totalLength;
          for (const [k, v] of Object.entries(b.rarityLengths)) {
            a.rarityLengths[k] = (a.rarityLengths[k] || 0) + v;
          }
          let r = a.rarity;
          let L = a.rarityLengths[r] || 0;
          for (const [rr, ll] of Object.entries(a.rarityLengths)) {
            if (ll > L) {
              L = ll;
              r = rr;
            }
          }
          a.rarity = r;
          mergedClusters.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }

  // 6. For each cluster, body-trace + horizontal refinement.
  const detections: Detection[] = [];
  for (const c of mergedClusters) {
    if (c.totalLength < MIN_TITLE_LEN_TOTAL) continue;
    if (c.xMin < NEAR_LEFT_EDGE && c.totalLength < NEAR_LEFT_EDGE_MIN_TITLE_LEN) continue;
    if (c.yMin > H * BOTTOM_STRIP_FRAC && c.totalLength < BOTTOM_STRIP_MIN_TITLE_LEN) continue;

    const xLi = Math.max(0, c.xMin - HORIZONTAL_PAD);
    const xRi = Math.min(W - 1, c.xMax + HORIZONTAL_PAD);
    const titleWidth = xRi - xLi + 1;
    const minDarkRunLen = Math.max(20, Math.round(titleWidth * BODY_DARK_RUN_FRACTION));
    let topY = c.yMin;
    let bottomY = c.yMax;

    // Trace UP
    {
      let nonStreak = 0;
      for (let y = c.yMin - 1; y >= 0; y--) {
        const frac = darkFractionInRange(dark, W, y, xLi, xRi);
        const run = longestDarkRun(dark, W, y, xLi, xRi, MAX_RUN_GAP).length;
        const passes = frac >= BODY_DARK_FRACTION || run >= minDarkRunLen;
        if (passes) {
          topY = y;
          nonStreak = 0;
        } else {
          nonStreak++;
          if (nonStreak >= TRACE_NONQUAL_STREAK) break;
        }
      }
    }
    // Trace DOWN
    {
      let nonStreak = 0;
      for (let y = c.yMax + 1; y < H; y++) {
        const frac = darkFractionInRange(dark, W, y, xLi, xRi);
        const run = longestDarkRun(dark, W, y, xLi, xRi, MAX_RUN_GAP).length;
        const passes = frac >= BODY_DARK_FRACTION || run >= minDarkRunLen;
        if (passes) {
          bottomY = y;
          nonStreak = 0;
        } else {
          nonStreak++;
          if (nonStreak >= TRACE_NONQUAL_STREAK) break;
        }
      }
    }

    if (bottomY - topY + 1 < MIN_BBOX_HEIGHT) continue;

    // Horizontal refinement: per-column dark fraction over the body y-range
    const yH = bottomY - topY + 1;
    const maxExt = Math.max(20, Math.round(titleWidth * HORIZONTAL_EXT_CAP_FRAC));
    let leftEdge = xLi;
    for (let x = xLi - 1; x >= Math.max(0, xLi - maxExt); x--) {
      let dCount = 0;
      for (let y = topY; y <= bottomY; y++) if (dark[y * W + x]) dCount++;
      if (dCount / yH >= HORIZONTAL_EXT_COL_DARK) leftEdge = x;
      else break;
    }
    let rightEdge = xRi;
    for (let x = xRi + 1; x <= Math.min(W - 1, xRi + maxExt); x++) {
      let dCount = 0;
      for (let y = topY; y <= bottomY; y++) if (dark[y * W + x]) dCount++;
      if (dCount / yH >= HORIZONTAL_EXT_COL_DARK) rightEdge = x;
      else break;
    }

    let bodyDarkSum = 0;
    let bodyCells = 0;
    for (let y = topY; y <= bottomY; y++) {
      for (let x = leftEdge; x <= rightEdge; x++) {
        bodyCells++;
        if (dark[y * W + x]) bodyDarkSum++;
      }
    }
    const bodyDarkFrac = bodyCells > 0 ? bodyDarkSum / bodyCells : 0;

    detections.push({
      left: leftEdge,
      top: topY,
      width: rightEdge - leftEdge + 1,
      height: yH,
      rarity: c.rarity,
      titleY: c.yMin,
      titleLen: c.totalLength,
      bodyDarkFrac,
    });
  }

  // 7. Filter
  const filtered = detections.filter((d) => {
    if (d.width < 60 || d.height < MIN_BBOX_HEIGHT) return false;
    if (d.bodyDarkFrac < 0.50) return false;
    const aspect = d.width / d.height;
    if (aspect < 0.2 || aspect > 3.0) return false;
    if (d.width * d.height > 0.5 * W * H) return false;
    return true;
  });

  // 8. NMS: keep larger boxes; drop smaller ones mostly contained
  filtered.sort((a, b) => b.width * b.height - a.width * a.height);
  const kept: Detection[] = [];
  for (const d of filtered) {
    let dominated = false;
    for (const k of kept) {
      const ix1 = Math.max(d.left, k.left);
      const iy1 = Math.max(d.top, k.top);
      const ix2 = Math.min(d.left + d.width, k.left + k.width);
      const iy2 = Math.min(d.top + d.height, k.top + k.height);
      const iw = Math.max(0, ix2 - ix1);
      const ih = Math.max(0, iy2 - iy1);
      const inter = iw * ih;
      const dArea = d.width * d.height;
      if (inter / dArea > 0.6) {
        dominated = true;
        break;
      }
    }
    if (!dominated) kept.push(d);
  }
  return kept;
}

/**
 * Resize imageBytes to fit within ANTHROPIC_BYTE_BUDGET. PNG → JPEG fallback,
 * then iterative 80% downscale until budget is met.
 */
async function resizeToFit(
  bytes: Buffer,
  mediaType: SupportedImageMediaType
): Promise<{ bytes: Buffer; mediaType: SupportedImageMediaType; resized: boolean }> {
  if (analyticalBase64Size(bytes.length) <= ANTHROPIC_BYTE_BUDGET) {
    return { bytes, mediaType, resized: false };
  }
  const meta = await sharp(bytes).metadata();
  let currentWidth = meta.width ?? 1920;
  let currentHeight = meta.height ?? 1080;

  let current = await sharp(bytes).jpeg({ quality: JPEG_FALLBACK_QUALITY }).toBuffer();
  if (analyticalBase64Size(current.length) <= ANTHROPIC_BYTE_BUDGET) {
    return { bytes: current, mediaType: "image/jpeg", resized: true };
  }

  const SCALE_STEP = 0.8;
  for (
    let iter = 0;
    iter < 20 && analyticalBase64Size(current.length) > ANTHROPIC_BYTE_BUDGET;
    iter++
  ) {
    currentWidth = Math.max(1, Math.round(currentWidth * SCALE_STEP));
    currentHeight = Math.max(1, Math.round(currentHeight * SCALE_STEP));
    current = await sharp(current)
      .resize({ width: currentWidth, height: currentHeight, fit: "inside" })
      .jpeg({ quality: JPEG_FALLBACK_QUALITY })
      .toBuffer();
  }
  return { bytes: current, mediaType: "image/jpeg", resized: true };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Runs the full tooltip-detection and crop pipeline on a D4 screenshot.
 *
 * Never throws — any failure falls back to a single full-image entry
 * (post-resize) with detected=false. Failure is logged via a single
 * `[crop]` line.
 */
export async function cropForVision(
  imageBytes: Buffer,
  mediaType: SupportedImageMediaType
): Promise<CropResult> {
  try {
    return await _cropForVision(imageBytes, mediaType);
  } catch (err) {
    console.error("[crop] Detection error — falling back to full image:", err);
    try {
      const {
        bytes: fallbackBytes,
        mediaType: fallbackType,
        resized,
      } = await resizeToFit(imageBytes, mediaType);
      return {
        images: [{ bytes: fallbackBytes, mediaType: fallbackType }],
        detected: false,
        resized,
        encodedBytes: analyticalBase64Size(fallbackBytes.length),
      };
    } catch (resizeErr) {
      console.error("[crop] Fallback resize also failed:", resizeErr);
      return {
        images: [{ bytes: imageBytes, mediaType }],
        detected: false,
        resized: false,
        encodedBytes: analyticalBase64Size(imageBytes.length),
      };
    }
  }
}

async function _cropForVision(
  imageBytes: Buffer,
  mediaType: SupportedImageMediaType
): Promise<CropResult> {
  // Downscale for detection
  const origMeta = await sharp(imageBytes).metadata();
  const origWidth = origMeta.width ?? 1;
  const origHeight = origMeta.height ?? 1;
  const scaleFactor = Math.min(
    1.0,
    DETECT_MAX_SIDE / Math.max(origWidth, origHeight)
  );

  const { data: rawData, info } = await sharp(imageBytes)
    .resize({
      width: Math.round(origWidth * scaleFactor),
      height: Math.round(origHeight * scaleFactor),
      fit: "inside",
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const detections = detectTooltips(rawData, info.width, info.height, info.channels);

  if (detections.length === 0) {
    // Fallback: full image post-resize
    const {
      bytes: fallbackBytes,
      mediaType: fallbackType,
      resized,
    } = await resizeToFit(imageBytes, mediaType);
    return {
      images: [{ bytes: fallbackBytes, mediaType: fallbackType }],
      detected: false,
      resized,
      encodedBytes: analyticalBase64Size(fallbackBytes.length),
    };
  }

  // Map each detection back to original coordinates and crop
  const invScale = scaleFactor > 0 ? 1 / scaleFactor : 1;
  const cropResults: Array<{
    bytes: Buffer;
    mediaType: SupportedImageMediaType;
    resized: boolean;
  }> = [];
  for (const d of detections) {
    const padX = Math.round(d.width * CROP_PADDING_FRACTION * invScale);
    const padY = Math.round(d.height * CROP_PADDING_FRACTION * invScale);
    const left = Math.max(0, Math.round(d.left * invScale) - padX);
    const top = Math.max(0, Math.round(d.top * invScale) - padY);
    const right = Math.min(origWidth, Math.round((d.left + d.width) * invScale) + padX);
    const bottom = Math.min(origHeight, Math.round((d.top + d.height) * invScale) + padY);
    if (right <= left || bottom <= top) continue;

    const croppedBytes = await sharp(imageBytes)
      .extract({ left, top, width: right - left, height: bottom - top })
      .png()
      .toBuffer();
    const resized = await resizeToFit(croppedBytes, "image/png");
    cropResults.push(resized);
  }

  if (cropResults.length === 0) {
    // Should never happen — but be safe
    const {
      bytes: fallbackBytes,
      mediaType: fallbackType,
      resized,
    } = await resizeToFit(imageBytes, mediaType);
    return {
      images: [{ bytes: fallbackBytes, mediaType: fallbackType }],
      detected: false,
      resized,
      encodedBytes: analyticalBase64Size(fallbackBytes.length),
    };
  }

  let totalEncoded = 0;
  let anyResized = false;
  for (const r of cropResults) {
    totalEncoded += analyticalBase64Size(r.bytes.length);
    if (r.resized) anyResized = true;
  }

  return {
    images: cropResults.map((r) => ({ bytes: r.bytes, mediaType: r.mediaType })),
    detected: true,
    resized: anyResized,
    encodedBytes: totalEncoded,
  };
}
