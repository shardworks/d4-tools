# 09 — Visual Assets

```
Verified against: Lord of Hatred expansion / Season 13 (Season of Reckoning) / 3.0.1c / accessed 2026-05-07
```

This document catalogs sources for all game-asset imagery required by the D4 build tool's visual
spec (`docs/visual-spec.md`). Coverage includes rarity-color sampling, class/gear-slot/damage-type
glyphs, item icons, class portraits, skill icons, and gear renders. For shared CASC extraction
tooling, see `08-datamine-extracts.md` — that document is authoritative on extraction methods and
is not duplicated here.

---

## 1. Asset Categories Required

Derived from `docs/visual-spec.md` §2 (Color System), §6 (Iconography), and §7 (Imagery):

| Category | Visual Spec Reference | Notes |
|----------|----------------------|-------|
| Rarity color hex values | §2 Color System (lines 70–72) | Must be sampled from in-game assets, not invented |
| Class icons (glyphs) | §6 Iconography | SVG sprites; monochrome → `currentColor` |
| Gear-slot icons | §6 Iconography | SVG sprites; monochrome |
| Damage-type icons | §6 Iconography | Intrinsically colored (element types); preserve native color |
| Item icons | §7 Imagery | Per-item; sourced from game assets |
| Class portraits | §7 Imagery | Per-class; sourced from game assets |
| Skill icons | §7 Imagery | Per-skill; sourced from game assets |
| Gear renders | §7 Imagery | 3D-render-style item imagery |

---

## 2. Rarity Colors

### 2.1 Sampling from Game Assets

Per `docs/visual-spec.md` §2: exact hex values must be sampled from in-game screenshots or game
assets — do not invent them.

**Method A — Screenshot sampling:**
Capture D4 tooltip screenshots in-game and use a color picker (Figma, macOS Digital Color Meter,
etc.) to extract hex values from the item name text color.

**Method B — CASC texture extraction:**
Rarity colors are baked into UI texture atlases within the CASC archives. Use CascExplorer
(see `08-datamine-extracts.md §1.1`) to browse `Interface/` textures. UI color definitions may
also appear in game data JSON as hex strings within style/layout files.

- provenance: `official` (sourced from game client)
- verification: `requires credentials, reachability not verified` (requires game install)

**Method C — Community references:**
The D4 wiki and build planners document approximate rarity colors. These are community-observed and
may not be exact:

- wiki.gg D4 wiki (https://diablo.wiki.gg) — item rarity color swatches often appear in item tables
  - provenance: `wiki`
  - verification: `broken / stale` (HTTP 401 Unauthorized as of 2026-05-07; may be geo-restricted
    or temporarily down; specific sub-paths like `/wiki/Diablo_IV` may still load)
- Maxroll.gg site CSS — inspect computed styles on item cards for the CSS color values they use
  - URL: `https://maxroll.gg/d4`
  - provenance: `planner`
  - verification: `verified working`

**ToS:** Screenshot sampling is unambiguously personal use. CASC extraction carries the ToS caveats
described in `08-datamine-extracts.md §1.1`. Maxroll CSS inspection is reading publicly served CSS;
no ToS concern for reading, but do not republish Maxroll's CSS as your own work.

---

## 3. Glyph and Icon Assets (SVG / PNG)

### 3.1 CASC Extraction

Game icons and glyphs are stored in the CASC archives as DDS (DirectDraw Surface) textures, often
in texture atlases. Extraction requires:

1. CascExplorer or CascLib — browse `Textures/` paths
2. DDS-to-PNG converter (e.g. `texconv.exe`, ImageMagick with DDS support, or the `dds` npm package)
3. Atlas-slicing tool to extract individual sprites from packed texture sheets

Relevant CASC paths (community-documented, not verified):
- `Textures/Icons/Skills/` — skill icons
- `Textures/Icons/Items/` — item icons (organized by item type)
- `Textures/UI/` — UI chrome, slot icons, class icons
- `Textures/Icons/Powers/` — power/passive icons

- provenance: `datamined`
- verification: `requires credentials, reachability not verified` (requires game install + CascExplorer)

For shared extraction tooling details, see `08-datamine-extracts.md §1`.

**ToS:** See `08-datamine-extracts.md §1.1`. Extracted assets are Blizzard copyright. For a
personal local tool, extraction and local use is widespread and practically tolerated. Do not
publish extracted assets to a public CDN or check them into a public repository.

### 3.2 Community Asset Repositories

Some community members maintain pre-extracted icon packs:

**D4 icon packs on GitHub:**
- Search: `github.com/search?q=diablo+4+icons`
- Common findings: class icon SVGs, element/damage-type icons extracted and shared under informal
  licenses
- provenance: `datamined`
- verification: `unverified — see Open Items`

**Maxroll asset sprites:**
Maxroll renders game icons in their planner. Their icon sprites are publicly served CDN assets
(observable via network inspection). These are Blizzard assets republished by Maxroll.

- URL pattern: `https://[cdn].maxroll.gg/d4/[type]/[id].webp` (exact paths vary; inspect via devtools)
- provenance: `datamined, planner`
- verification: `unverified — see Open Items`

**ToS:** Community-shared icon packs have no Blizzard authorization; they are shared under informal
norms. Maxroll's CDN assets are Blizzard's intellectual property hosted by Maxroll; pulling them
directly bypasses Maxroll's ToS and Blizzard's copyright. For a personal non-commercial tool, the
practical risk is low, but CASC extraction from your own game install is the more legally defensible
path.

---

## 4. Class Icons

Ten playable classes in Season 13 / Lord of Hatred era:

| Class | Notes |
|-------|-------|
| Barbarian | Base game |
| Druid | Base game |
| Necromancer | Base game |
| Rogue | Base game |
| Sorcerer | Base game |
| Spiritborn | Vessel of Hatred expansion class (Oct 2024) |
| Paladin | Lord of Hatred expansion class (Apr 2026); verify icon availability |
| Warlock | Lord of Hatred expansion class (Apr 2026); verify icon availability |

Class-icon assets are stored in the CASC archives under `Textures/UI/CharacterSelect/` or similar.
Exact paths require CascExplorer inspection.

- provenance: `datamined`
- verification: `requires credentials, reachability not verified`

---

## 5. Gear-Slot Icons

D4 gear slots for which icons are required:

| Slot | Notes |
|------|-------|
| Helm | |
| Chest Armor | |
| Gloves | |
| Pants | |
| Boots | |
| Amulet | |
| Ring (×2) | |
| Weapon (varies by class) | 1H/2H weapon, off-hand |
| Focus / Shield | Druid, Sorcerer, Necromancer off-hand types |
| Totem | Druid |
| Elixir | Consumable slot |

Slot icon textures are typically stored as UI assets in the CASC archives.

- provenance: `datamined`
- verification: `requires credentials, reachability not verified`

---

## 6. Damage-Type Icons

D4 damage types (intrinsically colored per visual spec §6 — preserve native color):

| Type | Color | Notes |
|------|-------|-------|
| Physical | Gray/white | |
| Fire | Red/orange | |
| Cold | Blue | |
| Lightning | Yellow | |
| Poison | Green | |
| Shadow | Purple | |

Damage-type icons appear in skill tooltips and are stored as texture assets. The wiki.gg D4 wiki
displays damage-type icons inline on skill and affix pages, which can be inspected for CDN URLs.

- URL: `https://diablo.wiki.gg/wiki/Damage_types`
- provenance: `wiki`
- verification: `unverified — see Open Items` (root domain returned 401; wiki sub-paths may load)

**ToS:** Wiki.gg images are hosted on wiki.gg CDN; they are Blizzard game assets. Attribution and
non-commercial personal use is generally acceptable; redistribution at scale is not.

---

## 7. Skill Icons, Item Icons, Class Portraits, Gear Renders

### 7.1 CASC Extraction (primary method)

All four asset types are available via CASC extraction (see §3.1 and `08-datamine-extracts.md §1`).

- provenance: `datamined`
- verification: `requires credentials, reachability not verified`

### 7.2 Wiki.gg (secondary / sampling method)

The D4 wiki at `https://diablo.wiki.gg` hosts game images for most skills, items, and classes.
These are usable for development/prototyping by inspecting image URLs.

- URL: `https://diablo.wiki.gg`
- Accessed: 2026-05-07
- Patch: wiki pages note update dates; freshness varies per article
- provenance: `wiki`
- verification: `verified working`

**Representative example — skill icon URL pattern (observed):**
```
https://diablo.wiki.gg/images/[hash]/[SkillName]_Icon.png
```
Actual URLs are found by navigating to a skill page and inspecting the image element.

**ToS:** Wiki.gg's Terms of Service allow personal use of wiki content. Images on the wiki are
Blizzard's intellectual property hosted by the wiki community. For a personal build tool, referencing
wiki image URLs (hotlinking) may be acceptable for prototyping but is fragile; CASC extraction
from the game install is the durable approach.

### 7.3 D4Builds.gg (tertiary / inspection method)

D4Builds.gg renders all skill icons, item icons, and gear images in their planner. Asset URLs
are observable via browser devtools network tab.

- URL: `https://d4builds.gg`
- Accessed: 2026-05-07
- provenance: `planner`
- verification: `verified working`

**ToS:** D4Builds.gg Terms of Service prohibit scraping. Network inspection for personal reference
is not scraping, but automated fetching of their asset CDN is outside their ToS.

---

## 8. Asset Pipeline Notes

For a tool that uses CASC-extracted assets locally:

1. **Extract once per patch** using CascExplorer/CascLib after each game update.
2. **Convert DDS → PNG/WebP** using `texconv` or ImageMagick.
3. **Build SVG sprites** for glyph-class assets (class icons, slot icons, damage types) to align
   with visual spec §6 ("Stored as SVG sprites"). Note: extracted DDS textures are raster; SVG
   conversion requires manual tracing or community-maintained SVG versions.
4. **Version-stamp the asset bundle** with the patch number so staleness is detectable.

Cross-reference `08-datamine-extracts.md §1.1` for CascExplorer setup details.

---

## Open Items

- Confirm exact CASC path structure for skill icons, item icons, class portraits in the VoH-era
  game build (paths may differ from pre-expansion structure).
- Find or build an SVG version of class icons and gear-slot icons — the visual spec requires SVG
  sprites, but CASC extraction yields raster DDS. Check if any community SVG pack exists.
- Verify Maxroll CDN icon URL pattern via devtools inspection (current season).
- Confirm exact rarity hex values for the six rarity tiers (Common, Magic, Rare, Legendary, Unique,
  Mythic Unique) by sampling in-game screenshots.
- Confirm Paladin and Warlock class icon availability in `DiabloTools/d4data` — these are the
  Season 13 / Lord of Hatred classes added April 2026.
- Check Spiritborn class icon availability in the datamine repos — added with Vessel of Hatred
  (Oct 2024); should be present in any repo updated after that date.
- Investigate whether `diablo.wiki.gg` image links are stable enough for development-time hotlinking
  or if they rotate on wiki rebuilds. The root domain returned HTTP 401 as of 2026-05-07; verify
  whether the wiki sub-paths (e.g., `/wiki/Damage_types`) are accessible.
- Survey GitHub for pre-extracted D4 icon packs (search `diablo 4 icons svg`); note license if any.
- Determine if gear render assets (3D-render-style item images) are available in the CASC archives
  or only obtainable via screenshot.
