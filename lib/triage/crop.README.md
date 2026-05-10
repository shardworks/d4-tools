# lib/triage/crop — Tooltip Detector and Cropper

Server-side image preprocessing for D4 screenshot triage. Runs between the
SHA-256 cache lookup and the Anthropic Vision API call on every cache miss.
The cropper is **memory-only** — it never modifies the on-disk original at
`SCREENSHOT_DIR/<filename>`.

---

## Chosen Detection Approach

**Color-threshold + connected-components on a downscaled working copy (D4, D25)**

D4 item tooltips have a distinctive near-black brownish background
(approximately RGB 15–25, 10–20, 5–15) that stands out strongly against the
brighter game environment. The pipeline exploits this:

1. **Downscale** the input to a working copy no larger than `DETECT_MAX_SIDE`
   on its longest edge (default: 960 px). This speeds up the pixel loop without
   losing the tooltip's position signal.
2. **Threshold** every pixel: a pixel is "dark" when all three RGB channels are
   strictly below `DARK_THRESHOLD` (default: 60). Pure background pixels in the
   game world are bright enough to fall outside this window even after JPEG
   artefacts.
3. **BFS connected-components**: walk 4-connected dark pixels to group them into
   regions. Track the largest region by pixel count.
4. **Sanity-check** the largest region's bounding box against configurable
   limits (area fraction, aspect ratio). This rejects HUD slivers, loading
   screens, and other false positives without tuning per-screenshot.
5. **Map back to original resolution** and crop with a small padding margin.
   Cropping is performed on the original full-resolution bytes to preserve
   affix text fidelity (D25).
6. **Resize-to-fit**: re-encode as PNG (or JPEG if the PNG exceeds the byte
   budget) and iterate downscale until the Anthropic base64 input limit is met.

On any failure (no dark region, sanity check fails, `sharp` error), the
pipeline falls back to a single full-image entry post-resize. Detection failure
is logged but never surfaced to the user.

---

## Tunables

All tunables are named TypeScript exports with JSDoc. No environment variables,
no JSON config (D3). To change a value, edit `lib/triage/crop.ts` and
typecheck.

| Export | Default | What failure mode it addresses |
|--------|---------|-------------------------------|
| `ANTHROPIC_BYTE_BUDGET` | `5_000_000` | Sits ~240 KB below the documented 5,242,880-byte per-image limit; absorbs envelope overhead (JSON framing, tool schema, text block). Lower this constant if 400s reappear at production load. |
| `DETECT_MAX_SIDE` | `960` | Limits working-copy size for the pixel loop. Larger values slow detection without improving accuracy for the colour-threshold heuristic. Increase if high-DPI screenshots produce missed detections. |
| `DARK_THRESHOLD` | `60` | Pixel is "tooltip dark" when R, G, and B are all below this value. Raise if real tooltips are missed (dimly lit screenshots); lower if game shadows or HUD elements trigger false crops. |
| `MIN_REGION_AREA_FRACTION` | `0.01` | Rejects micro-crops from isolated dark pixels, health-orb edges, and map-border lines that are too small to be a tooltip. |
| `MAX_REGION_AREA_FRACTION` | `0.75` | Rejects near-black loading screens and cut-scenes whose bounding box spans almost the full frame (a crop of that size gains nothing). |
| `MIN_ASPECT_RATIO` | `0.15` | Rejects thin horizontal strips (HUD action bar, cooldown overlays). D4 tooltips are always taller than wide. |
| `MAX_ASPECT_RATIO` | `3.0` | Rejects extremely wide bounding boxes from multi-slot HUD layouts that happen to be mostly dark. |
| `JPEG_FALLBACK_QUALITY` | `85` | JPEG quality used when PNG crop exceeds the byte budget. 85 keeps affix numbers and rolled values readable. Lower if JPEG still exceeds budget after the first resize pass. |
| `CROP_PADDING_FRACTION` | `0.05` | Fractional padding added around the detected bounding box before cropping. Guards against tooltip edges being clipped when detection noise places the bounding box slightly inside the real tooltip edge. |

---

## Observed Per-Fixture Success Rate

Measured by `__tests__/triage-cropper.test.ts` against the committed fixtures
in `__tests__/fixtures/triage/`:

| Fixture | Size | detected | resized | encodedBytes |
|---------|------|----------|---------|-------------|
| `tooltip-single.png` | ~32 KB | **true** | false | 8,864 |
| `tooltip-wide.png` | ~32 KB | **true** | false | 21,932 |
| `oversized.png` | ~6 MB | false | **true** | 1,690,816 |
| `no-tooltip.png` | ~31 KB | false | false | 41,800 |

**Ratchet floor (D26):** at least 2 of 4 fixtures must detect successfully.
Current pass rate: 2 of 4 (tooltip-single, tooltip-wide).

`oversized.png` has random-noise background (no tooltip), so detection correctly
falls back to the full image. The full ~6 MB image is then JPEG-compressed in
one step down to ~1.27 MB (encoded: ~1.69 MB), well within the 5 MB budget.

---

## Fallback Contract

On any failure — no dark region found, bounding box fails sanity checks,
`sharp` throws, or any other exception — the pipeline returns a single
full-image entry (D9):

```typescript
{
  images: [{ bytes: originalOrResized, mediaType: ... }],
  detected: false,
  resized: <true if resize was needed>,
  encodedBytes: <final base64 byte count>,
}
```

The fallback image is itself resized to `ANTHROPIC_BYTE_BUDGET` if needed.
If even the resize throws, the original bytes are shipped as-is and a
`[crop]` error line is emitted. The route handler receives the result; no
exception escapes `cropForVision()`.

---

## Module Layout

| Symbol | Kind | Purpose |
|--------|------|---------|
| `ANTHROPIC_BYTE_BUDGET` | export const | Per-image base64 byte limit |
| `DETECT_MAX_SIDE` | export const | Detection working-copy max edge |
| `DARK_THRESHOLD` | export const | Channel intensity cutoff |
| `MIN_REGION_AREA_FRACTION` | export const | Minimum valid region fraction |
| `MAX_REGION_AREA_FRACTION` | export const | Maximum valid region fraction |
| `MIN_ASPECT_RATIO` | export const | Minimum valid aspect ratio |
| `MAX_ASPECT_RATIO` | export const | Maximum valid aspect ratio |
| `JPEG_FALLBACK_QUALITY` | export const | JPEG fallback quality |
| `CROP_PADDING_FRACTION` | export const | Bounding-box padding |
| `CropResult` | export interface | Return shape (D14) |
| `cropForVision` | export async fn | Main entry point — never throws |
