# lib/triage/crop — Tooltip Detector and Cropper

Server-side image preprocessing for D4 screenshot triage. Runs between the
SHA-256 cache lookup and the Anthropic Vision API call on every cache miss.
The cropper is **memory-only** — it never modifies the on-disk original at
`SCREENSHOT_DIR/<filename>`.

---

## Detection Approach

**Title-anchored, frame-color-aware detection.**

The most reliable signal a D4 tooltip provides is its **title text**:
rarity-colored letters rendered on a dark background. Border lines vary by
rarity but the title-text-on-dark pattern is consistent across all chromatic
rarities (Magic, Rare, Legendary, Unique). The pipeline:

1. **Downscale** the input to a working copy no larger than `DETECT_MAX_SIDE`
   on its longest edge (default: 960 px).
2. **Per-pixel classification**:
   - `dark` (interior candidate): luminance < `DARK_LUM_MAX`.
   - `frame-color` (per rarity): HSV match against tuned ranges per rarity.
3. **Dark-context filter**: keep rarity pixels that have ≥3 dark neighbors
   above OR below within `y±2..y±12`. Eliminates the bulk of false
   positives (cobblestones, character armor, sky).
4. **Per-row title runs**: find rows with long horizontal runs of
   dark-context rarity pixels — these are title rows.
5. **Cluster** row hits into per-tooltip title clusters by y-adjacency +
   x-overlap.
6. **Merge** clusters bridged by dark-dominant gaps (handles a single
   tooltip producing multiple rarity-colored runs across body affixes).
7. **Body-trace** UP and DOWN through dark-dominant rows. Combined
   criterion: dark fraction ≥ `BODY_DARK_FRACTION` OR longest dark run ≥
   `BODY_DARK_RUN_FRACTION` × bbox width. Stops on
   `TRACE_NONQUAL_STREAK` consecutive non-qualifying rows.
8. **Horizontal refinement**: extend left/right by per-column dark fraction,
   capped to ±`HORIZONTAL_EXT_CAP_FRAC` × titleWidth.
9. **Filter** (size, body-darkness, aspect, area). NMS by area: drop
   bboxes mostly contained in larger ones.
10. **Map back** to full resolution + small padding; crop each detected
    region from the original full-resolution bytes.
11. **Resize-to-fit**: re-encode each crop as PNG (or JPEG fallback at
    `JPEG_FALLBACK_QUALITY` if the PNG exceeds the byte budget) and
    iteratively downscale until the per-image limit is met.

Multi-tooltip support is natural — each title cluster yields one bbox.

On any failure (no tooltip found, sharp throws), the pipeline falls back
to a single full-image entry post-resize. Failure is logged but never
surfaced to the user.

---

## Per-Rarity Color Ranges

HSV thresholds tuned against the bundled D4 screenshot fixture set:

| Rarity    | Hue (°)   | Saturation | Value     | Notes                                |
|-----------|-----------|------------|-----------|--------------------------------------|
| Common    | any       | < 0.22     | > 0.70    | Low-saturation white; weak signal    |
| Magic     | 195–245   | > 0.25     | > 0.40    | Blue (cyan-ward)                     |
| Rare      | 45–70     | > 0.45     | > 0.55    | Yellow                               |
| Legendary | 22–45     | > 0.50     | > 0.50    | Orange                               |
| Unique    | 15–35     | > 0.45     | 0.40–0.85 | Amber/rust (slightly less bright)    |

Common-rarity detection is best-effort — white text appears throughout D4
HUD/scenery, so the dark-context filter alone can't fully disambiguate it.
Common items currently fall back to full-image when the title doesn't
generate a long-enough run after dark-context filtering.

---

## Tunables

All tunables are named TypeScript exports with JSDoc. To change a value,
edit `lib/triage/crop.ts` and typecheck.

| Export | Default | What failure mode it addresses |
|--------|---------|-------------------------------|
| `ANTHROPIC_BYTE_BUDGET` | `5_000_000` | Sits ~240 KB below the documented 5,242,880-byte per-image limit; absorbs envelope overhead. Lower if 400s reappear. |
| `DETECT_MAX_SIDE` | `960` | Limits working-copy size for the heuristic loop. Larger values waste CPU without improving detection. |
| `DARK_LUM_MAX` | `60` | Luminance threshold for "dark interior" pixels. Raise if real tooltips are missed (dimly lit screenshots); lower if game scenery triggers false crops. |
| `BODY_DARK_FRACTION` | `0.40` | Minimum dark fraction in a row for it to count as part of the tooltip body. |
| `BODY_DARK_RUN_FRACTION` | `0.50` | Alternative criterion: minimum longest-dark-run length (as fraction of bbox width) for body row qualification. Saves rows where text disrupts the dark fraction. |
| `TRACE_NONQUAL_STREAK` | `4` | Body trace stops after this many consecutive non-qualifying rows. |
| `HORIZONTAL_PAD` | `8` | Detect-pixel padding added to the title cluster's x-range. |
| `HORIZONTAL_EXT_CAP_FRAC` | `1.0` | Cap on horizontal bbox extension (× titleWidth) per side. |
| `HORIZONTAL_EXT_COL_DARK` | `0.70` | Per-column dark-fraction threshold during horizontal extension. Lower extends more aggressively (risk of bridging to adjacent panes); higher extends less. |
| `MIN_TITLE_LEN_TOTAL` | `130` | Sum of horizontal run lengths across cluster rows; below this, the cluster is dropped. |
| `MIN_BBOX_HEIGHT` | `80` | Minimum bbox height (detect-pixel rows) to accept as a tooltip. |
| `NEAR_LEFT_EDGE` | `30` | Detect-pixel distance from the left edge. Clusters closer than this need a stronger title signal (`NEAR_LEFT_EDGE_MIN_TITLE_LEN`) to avoid inventory-pane false positives. |
| `BOTTOM_STRIP_FRAC` | `0.85` | Clusters at y > BOTTOM_STRIP_FRAC × H with weak title-len are usually footer key hints, not tooltips. |
| `JPEG_FALLBACK_QUALITY` | `85` | JPEG quality for the resize-to-fit fallback. |
| `CROP_PADDING_FRACTION` | `0.04` | Fractional padding added around each detected bbox before cropping. |

---

## Real-Fixture Detection Report

Detection results across the bundled real-screenshot fixture set
(`__tests__/fixtures/triage/real/`):

| Fixture                              | Rarity tier              | Detected |
|--------------------------------------|--------------------------|----------|
| `diablo-4-tiabult-s-will.jpg`        | Unique                   | ✓ 1      |
| `Screenshot014.jpg`                  | Legendary                | ✓ 1      |
| `Screenshot016.jpg`                  | Rare                     | ✓ 1      |
| `Screenshot017.jpg`                  | Rare × 2 (side-by-side)  | ✓ 2      |
| `Screenshot018.jpg`                  | Rare                     | ✓ 1      |
| `Screenshot019.jpg`                  | Magic                    | ✓ 1      |
| `Screenshot020.jpg`                  | Legendary                | ✓ 1      |
| `Screenshot021.jpg`                  | Unique + Magic           | ✓ 2      |
| `Screenshot022.jpg`                  | Unique                   | ✓ 1      |
| `Screenshot023.jpg`                  | Common (white/gray)      | ✗ miss → full-image fallback |

**Real-fixture detection rate: 11 of 12 distinct tooltips (92%).**

The Common case (Screenshot023) is the known-miss limitation. Common items
in D4 are typically junk; in practice the full-image fallback still allows
the Vision API to read the tooltip for the rare cases where Common items
need triage.

The synthetic legacy fixtures (`tooltip-single.png`, `tooltip-wide.png`,
`oversized.png`, `no-tooltip.png`) act as smoke tests for the
resize-to-fit pipeline; they do not exercise the detector meaningfully
because they are pure black rectangles on flat brown backgrounds.

---

## Fallback Contract

On any failure — no tooltip found, sharp throws, or any other exception —
the pipeline returns a single full-image entry:

```typescript
{
  images: [{ bytes: fallbackBytes, mediaType: ... }],
  detected: false,
  resized: <true if resize was needed>,
  encodedBytes: <final base64 byte count>,
}
```

The fallback image is itself resized to `ANTHROPIC_BYTE_BUDGET` if needed.
If even the resize throws, the original bytes are shipped as-is and a
`[crop]` error line is emitted. The route handler receives the result;
no exception escapes `cropForVision()`.

---

## Module Layout

| Symbol | Kind | Purpose |
|--------|------|---------|
| `ANTHROPIC_BYTE_BUDGET`         | const     | Per-image base64 byte limit |
| `DETECT_MAX_SIDE`               | const     | Detection working-copy max edge |
| `DARK_LUM_MAX`                  | const     | Luminance threshold for "dark" pixels |
| `BODY_DARK_FRACTION`            | const     | Body row dark-fraction threshold |
| `BODY_DARK_RUN_FRACTION`        | const     | Body row dark-run threshold |
| `TRACE_NONQUAL_STREAK`          | const     | Body trace streak |
| `HORIZONTAL_PAD`                | const     | Title padding |
| `HORIZONTAL_EXT_CAP_FRAC`       | const     | Horizontal extension cap |
| `HORIZONTAL_EXT_COL_DARK`       | const     | Horizontal extension column threshold |
| `MIN_TITLE_LEN_TOTAL`           | const     | Min cluster title length |
| `MIN_CLUSTER_LEN_FOR_MERGE`     | const     | Cluster merge participant threshold |
| `MIN_BBOX_HEIGHT`               | const     | Min bbox height |
| `NEAR_LEFT_EDGE`                | const     | Inventory-side filter distance |
| `NEAR_LEFT_EDGE_MIN_TITLE_LEN`  | const     | Inventory-side title-len threshold |
| `BOTTOM_STRIP_FRAC`             | const     | Bottom-strip filter y-fraction |
| `BOTTOM_STRIP_MIN_TITLE_LEN`    | const     | Bottom-strip title-len threshold |
| `JPEG_FALLBACK_QUALITY`         | const     | JPEG fallback quality |
| `CROP_PADDING_FRACTION`         | const     | Per-crop padding fraction |
| `RARITY_RANGES`                 | const     | Per-rarity HSV match functions |
| `CropResult`                    | interface | Return shape (multi-image) |
| `cropForVision`                 | async fn  | Main entry point — never throws |
