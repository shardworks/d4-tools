/**
 * Server-side tooltip detector and cropper for D4 screenshots.
 *
 * Pipeline (D4, D8, D9, D13, D19, D22, D23, D25, D28, D29):
 * 1. Downscale to DETECT_MAX_SIDE for heuristic work (D25).
 * 2. Color-threshold: mark pixels where all channels < DARK_THRESHOLD (D4).
 * 3. Connected-components (BFS): find the largest dark region (D4).
 * 4. Sanity-check the bounding box: min/max area fraction, aspect-ratio band (D23).
 * 5. Map detected region back to full resolution; add CROP_PADDING_FRACTION margin.
 * 6. Crop from the original full-resolution image (D25).
 * 7. Per-crop independent resize to ≤ ANTHROPIC_BYTE_BUDGET (D8, D29):
 *    a. If PNG fits, ship it.
 *    b. Otherwise convert to JPEG at JPEG_FALLBACK_QUALITY and iterate downscale
 *       until it fits.
 * 8. On any detection or processing failure: fall back to a single full-image
 *    entry (post-resize if needed) (D9, D18).
 *
 * The cropper is NOT called on cache hits (D5). It is invoked in the route
 * handler, NOT inside extractItemsFromImage (D13). The on-disk original at
 * ${SCREENSHOT_DIR}/<filename> is never modified — the cropper is memory-only.
 * Metadata is stripped by default (sharp strips it unless .withMetadata() is
 * called) (D28). Per-crop budgets are independent; no joint budget is applied
 * across images (D29). GIF input is handled uniformly — sharp flattens to frame
 * 0, and the fallback handles edge cases (D18).
 */

import sharp from "sharp";
import type { SupportedImageMediaType } from "./types";

// ─── Tunables (D3) ───────────────────────────────────────────────────────────

/**
 * Anthropic per-image base64 byte budget (D7).
 * Named constant so a single edit lowers the ceiling if 400s reappear.
 * Sits ~240 KB below the documented 5,242,880-byte limit to absorb envelope
 * overhead (JSON framing, tool-use schema, text block).
 */
export const ANTHROPIC_BYTE_BUDGET = 5_000_000;

/**
 * Longer edge (in pixels) of the downscaled working copy used for detection (D25).
 * Heuristic accuracy is stable at this size; larger values waste CPU and memory
 * without improving D4 tooltip detection quality.
 */
export const DETECT_MAX_SIDE = 960;

/**
 * Intensity threshold: a pixel is classified as "tooltip dark background" when
 * ALL three RGB channels are strictly below this value (D4).
 * D4 tooltip backgrounds are near-black brownish (~RGB(15,12,8)); threshold at
 * 60 catches real tooltips while rejecting mid-tone game scenery.
 * Raise if tooltips are being missed; lower if game shadows or HUD edges trigger
 * false crops.
 */
export const DARK_THRESHOLD = 60;

/**
 * Minimum fraction of detection-image area the detected region must occupy (D23).
 * Guards against single dark pixels or thin UI artifacts (health-orb edges, map
 * borders, skill-cooldown overlays) triggering a useless micro-crop.
 * Expressed as a fraction of total pixel count [0, 1].
 */
export const MIN_REGION_AREA_FRACTION = 0.01;

/**
 * Maximum fraction of detection-image area a detected region may occupy (D23).
 * Guards against near-black loading screens or cut-scenes producing a bounding
 * box that spans the entire image — such a crop gains nothing over the
 * full-image fallback.
 */
export const MAX_REGION_AREA_FRACTION = 0.75;

/**
 * Minimum aspect ratio (width / height) of the detected bounding box (D23).
 * D4 tooltips are taller than wide in most view states; this rejects thin
 * horizontal strips from the HUD action bar that happen to be very dark.
 */
export const MIN_ASPECT_RATIO = 0.15;

/**
 * Maximum aspect ratio (width / height) of the detected bounding box (D23).
 * Guards against extremely wide bounding boxes produced by multi-slot HUD
 * layouts that are mostly dark.
 */
export const MAX_ASPECT_RATIO = 3.0;

/**
 * JPEG quality used when the PNG crop exceeds the byte budget and the pipeline
 * falls back to JPEG encoding (D8).
 * 85 balances text fidelity (readable affix numbers and rolled values) against
 * file size; D4 tooltip text is large enough to survive JPEG at this level.
 * Lower this value if JPEG output still exceeds the budget after the first
 * resize pass.
 */
export const JPEG_FALLBACK_QUALITY = 85;

/**
 * Fractional padding added around the detected bounding box before cropping (D23).
 * Applied as a fraction of the detected region's smaller dimension.
 * Prevents tooltip edges from being clipped when detection noise places the
 * bounding-box boundary slightly inside the real tooltip edge.
 */
export const CROP_PADDING_FRACTION = 0.05;

// ─── Return type (D14) ───────────────────────────────────────────────────────

/**
 * Result of the crop pipeline. Consumed by route handlers and passed verbatim
 * to extractItemsFromImage (D13, D14).
 */
export interface CropResult {
  /**
   * One entry per detected tooltip region (v1: always length 1).
   * Each entry carries its own mediaType because the resize step may switch
   * PNG → JPEG (D8, D14).
   */
  images: Array<{ bytes: Buffer; mediaType: SupportedImageMediaType }>;
  /** true if tooltip detection succeeded; false if the full-image fallback is in use. */
  detected: boolean;
  /** true if any image was downscaled to satisfy ANTHROPIC_BYTE_BUDGET. */
  resized: boolean;
  /**
   * Total base64-encoded byte count across all images (D22).
   * Computed analytically — avoids allocating multi-MB base64 strings inside
   * the resize loop.
   */
  encodedBytes: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Analytic base64 byte count for N raw bytes — no allocation (D22). */
function analyticalBase64Size(rawBytes: number): number {
  return Math.ceil(rawBytes / 3) * 4;
}

interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
  pixelCount: number;
}

/**
 * Finds the bounding box of the largest connected component of dark pixels in a
 * raw-pixel buffer (output of sharp's .raw() call) using BFS (D4).
 *
 * A pixel is "dark" if ALL three RGB channels are < DARK_THRESHOLD.
 * 4-connectivity is used (horizontal and vertical neighbours only).
 *
 * Uses a typed-array ring buffer for the BFS queue to avoid O(n) Array.shift().
 * Returns null when no dark pixels exist.
 */
function findLargestDarkRegion(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): BoundingBox | null {
  const n = width * height;

  // ── Dark mask (1 = dark, 0 = non-dark) ──────────────────────────────────
  const dark = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * channels;
    if (
      data[p] < DARK_THRESHOLD &&
      data[p + 1] < DARK_THRESHOLD &&
      data[p + 2] < DARK_THRESHOLD
    ) {
      dark[i] = 1;
    }
  }

  // ── BFS — typed-array queue for efficiency ───────────────────────────────
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n); // worst case: all pixels in one component

  let bestBox: BoundingBox | null = null;

  for (let start = 0; start < n; start++) {
    if (!dark[start] || visited[start]) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    let count = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;

    while (head < tail) {
      const cur = queue[head++];
      count++;
      const cy = Math.floor(cur / width);
      const cx = cur % width;

      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      // 4-connected neighbours
      if (cx > 0) {
        const nb = cur - 1;
        if (dark[nb] && !visited[nb]) {
          visited[nb] = 1;
          queue[tail++] = nb;
        }
      }
      if (cx < width - 1) {
        const nb = cur + 1;
        if (dark[nb] && !visited[nb]) {
          visited[nb] = 1;
          queue[tail++] = nb;
        }
      }
      if (cy > 0) {
        const nb = cur - width;
        if (dark[nb] && !visited[nb]) {
          visited[nb] = 1;
          queue[tail++] = nb;
        }
      }
      if (cy < height - 1) {
        const nb = cur + width;
        if (dark[nb] && !visited[nb]) {
          visited[nb] = 1;
          queue[tail++] = nb;
        }
      }
    }

    if (bestBox === null || count > bestBox.pixelCount) {
      bestBox = {
        left: minX,
        top: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        pixelCount: count,
      };
    }
  }

  return bestBox;
}

/**
 * Resizes imageBytes to fit within ANTHROPIC_BYTE_BUDGET (D8).
 *
 * Strategy:
 * 1. If the image already fits, return it unchanged.
 * 2. Re-encode as JPEG at JPEG_FALLBACK_QUALITY (PNG → JPEG fallback).
 * 3. Iteratively downscale at 80% per step until the budget is met.
 *
 * Per-crop independent budget — no joint multi-image budget (D29).
 * Returns the final bytes, its mediaType, and whether resizing occurred.
 */
async function resizeToFit(
  bytes: Buffer,
  mediaType: SupportedImageMediaType
): Promise<{ bytes: Buffer; mediaType: SupportedImageMediaType; resized: boolean }> {
  if (analyticalBase64Size(bytes.length) <= ANTHROPIC_BYTE_BUDGET) {
    return { bytes, mediaType, resized: false };
  }

  // Get current dimensions before any JPEG conversion
  const meta = await sharp(bytes).metadata();
  let currentWidth = meta.width ?? 1920;
  let currentHeight = meta.height ?? 1080;

  // Try JPEG conversion first (D8)
  let current = await sharp(bytes)
    .jpeg({ quality: JPEG_FALLBACK_QUALITY })
    .toBuffer();

  if (analyticalBase64Size(current.length) <= ANTHROPIC_BYTE_BUDGET) {
    return { bytes: current, mediaType: "image/jpeg", resized: true };
  }

  // Iterative 80%-per-step downscale (D8)
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Runs the full tooltip-detection and crop pipeline on a D4 screenshot.
 *
 * Never throws — any failure falls back to the full image (post-resize) with
 * detected=false (D9). Failure is logged via a single `[crop]` line; no
 * structured log or extra fields (D20).
 */
export async function cropForVision(
  imageBytes: Buffer,
  mediaType: SupportedImageMediaType
): Promise<CropResult> {
  try {
    return await _cropForVision(imageBytes, mediaType);
  } catch (err) {
    // Fallback: full image post-resize (D9)
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
      // Last resort: ship the original as-is
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
  // ── 1. Downscale for detection (D25) ─────────────────────────────────────
  const origMeta = await sharp(imageBytes).metadata();
  const origWidth = origMeta.width ?? 1;
  const origHeight = origMeta.height ?? 1;

  const scaleFactor = Math.min(
    1.0,
    DETECT_MAX_SIDE / Math.max(origWidth, origHeight)
  );

  // removeAlpha() ensures we always get 3 channels (RGB) — handles RGBA PNGs
  const { data: rawData, info } = await sharp(imageBytes)
    .resize({
      width: Math.round(origWidth * scaleFactor),
      height: Math.round(origHeight * scaleFactor),
      fit: "inside",
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // ── 2–3. Dark pixel detection + largest connected component ───────────────
  const box = findLargestDarkRegion(rawData, info.width, info.height, info.channels);

  // ── 4. Sanity checks (D23) ───────────────────────────────────────────────
  const totalDetectPixels = info.width * info.height;
  let detected = false;
  let cropBox: { left: number; top: number; width: number; height: number } | null = null;

  if (box !== null) {
    const areaFraction = box.pixelCount / totalDetectPixels;
    const aspectRatio = box.width / (box.height || 1);

    if (
      areaFraction >= MIN_REGION_AREA_FRACTION &&
      areaFraction <= MAX_REGION_AREA_FRACTION &&
      aspectRatio >= MIN_ASPECT_RATIO &&
      aspectRatio <= MAX_ASPECT_RATIO
    ) {
      // ── 5. Map back to original resolution with padding (D25, D23) ──────
      const invScale = scaleFactor > 0 ? 1 / scaleFactor : 1;
      const rawLeft = Math.round(box.left * invScale);
      const rawTop = Math.round(box.top * invScale);
      const rawRight = Math.round((box.left + box.width) * invScale);
      const rawBottom = Math.round((box.top + box.height) * invScale);

      const padX = Math.round((rawRight - rawLeft) * CROP_PADDING_FRACTION);
      const padY = Math.round((rawBottom - rawTop) * CROP_PADDING_FRACTION);

      const left = Math.max(0, rawLeft - padX);
      const top = Math.max(0, rawTop - padY);
      const right = Math.min(origWidth, rawRight + padX);
      const bottom = Math.min(origHeight, rawBottom + padY);

      if (right > left && bottom > top) {
        cropBox = { left, top, width: right - left, height: bottom - top };
        detected = true;
      }
    }
  }

  // ── 6. Crop original resolution (or use full image on fallback) ───────────
  let croppedBytes: Buffer;
  let cropMediaType: SupportedImageMediaType;

  if (detected && cropBox !== null) {
    // Crop at full resolution; emit as PNG for maximum text fidelity (D25)
    croppedBytes = await sharp(imageBytes)
      .extract(cropBox)
      .png()
      .toBuffer();
    cropMediaType = "image/png";
  } else {
    // Detection failed sanity checks — full-image fallback (D9)
    croppedBytes = imageBytes;
    cropMediaType = mediaType;
    detected = false;
  }

  // ── 7. Per-crop independent resize to fit byte budget (D8, D29) ───────────
  const {
    bytes: finalBytes,
    mediaType: finalMediaType,
    resized,
  } = await resizeToFit(croppedBytes, cropMediaType);

  return {
    images: [{ bytes: finalBytes, mediaType: finalMediaType }],
    detected,
    resized,
    encodedBytes: analyticalBase64Size(finalBytes.length),
  };
}
