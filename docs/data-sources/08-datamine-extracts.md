# 08 — Datamine Extracts

```
Verified against: Lord of Hatred expansion / Season 13 (Season of Reckoning) / patch 3.0.1.71747 / accessed 2026-05-08
```

This document catalogs GitHub repositories and community resources that extract structured game data
directly from Diablo IV's CASC-format archive files. These are the upstream sources for skills,
items, affixes, strings, and binary assets used by all other data-area docs. See `09-visual-assets.md`
for asset-specific extraction notes; the CASC tooling described here is shared.

---

## 1. Extraction Infrastructure

### 1.1 CASC Archive Format

Diablo IV stores all game data in Blizzard's **CASC** (Content Addressable Storage Container)
format. Game data is not stored as readable files on disk; it requires extraction tooling before
any JSON payload or binary asset can be accessed.

**Primary extraction tools:**

- **CascExplorer** — GUI tool for browsing and exporting CASC archives.
  - URL: `https://github.com/WoW-Tools/CascExplorer`
  - provenance: `datamined`
  - verification: `unverified — see Open Items`

- **CascLib** — C/C++ library for programmatic CASC access. .NET and Python bindings exist.
  - URL: `https://github.com/WoW-Tools/CascLib`
  - provenance: `datamined`
  - verification: `unverified — see Open Items`

- **TACTLib** — .NET library for reading TACT/CASC storage; alternative to CascLib.
  - URL: `https://github.com/overtools/TACTLib`
  - provenance: `datamined`
  - verification: `unverified — see Open Items`

**ToS:** Blizzard's End-User License Agreement prohibits extracting, disassembling, or
reverse-engineering game files for any purpose other than personal use. The CASC extraction
community operates in a grey zone: extracting assets for personal modding or analysis is
widespread and Blizzard has not taken enforcement action against non-commercial dataminers,
but there is no explicit permission. For a personal build tool running locally, the practical
risk posture is low, but redistribution of extracted assets (including checking them into a
public repository) increases exposure meaningfully.

---

## 2. Primary Datamine Repositories

### 2.1 DiabloTools/d4data (active — use this one)

The canonical active D4 datamine repository as of 2026. This is the **successor** to the
archived `blizzhackers/d4data` repo; the blizzhackers README redirects here.

- URL: `https://github.com/DiabloTools/d4data`
- Accessed: 2026-05-07
- Patch: `3.0.1.71747` — Season 13 / Lord of Hatred. Actively maintained; build confirmed via
  datamine extraction of Paladin/Warlock class data (2026-05-08).
- provenance: `datamined`
- verification: `verified working` (HTTP 200; repo confirmed live with 863+ commits and 33 stars at access date; build 3.0.1.71747 confirmed to include Paladin and Warlock class data)

**Data browser:** `https://blizzhackers.dev` — a web interface for browsing the extracted data.
- URL: `https://blizzhackers.dev`
- Accessed: 2026-05-07
- provenance: `datamined`
- verification: `broken / stale` (connection timed out at access date — see Open Items)

**Coverage (observed from community references and repository structure):**

The repo provides JSON exports organized into directories matching internal game data categories:

```
d4data/
  json/
    base/
      meta/
        Item/           ← item definitions (.itm.json files)
        Power/          ← skill/power definitions
        Actor/          ← actor (monster/NPC) definitions
        Affix/          ← affix definitions
        Recipe/         ← crafting recipes
        StringList/     ← localized string tables
        Texture/        ← texture metadata (not raw assets)
    enUS_Text/          ← English string tables
```

**Season 13 / Lord of Hatred coverage:** Dataminers reportedly extracted Paladin and Warlock
class data ahead of the Lord of Hatred expansion launch (late April 2026; exact date unconfirmed).
The repo is expected to track the Season 13 patch cycle; verify the last-commit date before use.

**Representative example — affix entry (observed shape, not canonical):**

```json
{
  "__fileName__": "Affix_Str_AddLifePercent",
  "__snoID__": 1234567,
  "eAffixType": "AFFIX_TYPE_LEGENDARY",
  "arAffixSkillTagRequirements": [],
  "ptItemAffixAttributes": [
    {
      "tAttribute": {
        "eAttribute": "Attr_Max_Life_Percent",
        "nParam": 0
      },
      "afValue": [0.1, 0.15]
    }
  ]
}
```

**ToS:** The data itself is copyrighted Blizzard entertainment. The repo authors operate under the
assumption that datamining for non-commercial, analytical use is tolerated by Blizzard. Blizzard
has issued takedowns against D4 datamine content before launch (notably spoilers), but analytical
data repos have generally persisted post-release. Do not redistribute extracted data commercially
or in ways that compete with Blizzard's services.

---

### 2.2 blizzhackers/d4data (archived — do not use for current data)

The original datamine repo. **Archived as of July 4, 2024** and no longer receiving updates.
The README redirects to `DiabloTools/d4data` (§2.1).

- URL: `https://github.com/blizzhackers/d4data`
- Accessed: 2026-05-07
- Patch: last updated August 2024 (pre-Vessel of Hatred; **does not cover VoH or Lord of Hatred**)
- provenance: `datamined`
- verification: `broken / stale` (archived; data is pre-VoH)

This repo is documented for reference only. All implementation work should use `DiabloTools/d4data`.

---

### 2.3 Blizzhackers Community / Discord

The primary coordination community for D4 dataminers. New patch data is often posted before it
lands in the GitHub repo.

- URL: Invite link rotates; check the `DiabloTools/d4data` README for the current link.
- Accessed: 2026-05-07
- provenance: `datamined, forum`
- verification: `unverified — see Open Items`

**ToS:** Discord's Terms of Service apply. Data posted in community channels is shared under
informal norms; no explicit license.

---

## 3. Processed / Community API Sources

### 3.1 maxroll-d4-scraper (community tool)

A community Python/Selenium scraper that fetches Maxroll.gg and produces normalized JSON:
`builds.json`, `aspect_map.json`, `affix_map.json`, `uniques.json`.

- URL: `https://github.com/danparizher/maxroll-d4-scraper`
- Accessed: 2026-05-07
- Patch: Season 13 coverage unknown (verify via repo commit history)
- provenance: `planner` (scrapes Maxroll; Maxroll's data is datamine-derived)
- verification: `verified working` (HTTP 200; repo confirmed live with ~7 stars, 90 commits at access date; Season 13 coverage unconfirmed)

**ToS:** Maxroll's Terms of Service explicitly prohibit scraping. This community tool violates
Maxroll's ToS. For a personal non-commercial tool used locally, the practical enforcement risk is
low, but automated scraping pipelines against Maxroll's endpoints are not a defensible approach.
The underlying data originates from Blizzard's game files. Prefer `DiabloTools/d4data` for
affix/item/skill data.

---

## 4. String Tables and Localization

Localized strings (item names, affix display strings, skill descriptions) live in the `StringList`
and `enUS_Text` directories of the `DiabloTools/d4data` exports.

**Observed shape (string table entry):**

```json
{
  "id": "Affix_Str_AddLifePercent",
  "szLabel": "[{VALUE:1}]%|1|,|,| Max Life",
  "hLabel": 3412567890
}
```

String table entries use a custom interpolation syntax (`{VALUE:1}`) that must be parsed to
reconstruct display strings. The numeric range comes from the affix definition (§2.1 example).
Multi-value affixes produce entries like `"[{VALUE:1}]%–[{VALUE:2}]% Max Life"`.

- provenance: `datamined`
- verification: `verified working` (data present in `DiabloTools/d4data`; repo confirmed live at access date)

---

## 5. Patch Freshness Protocol

The load-bearing property for any datamine repo is whether it tracks the **current season and patch**.

**Season 13 anchor points (as verified at access date):**
- Lord of Hatred expansion launched: late April 2026 (exact date unconfirmed; Maxroll coverage
  dated May 6 references the expansion as released "a week ago")
- Two new classes: Paladin, Warlock (confirmed on Blizzard marketing site and live planners;
  all class data verified present in DiabloTools/d4data at build 3.0.1.71747)
- Current patch version string: `3.0.1.71747` (confirmed from DiabloTools/d4data, 2026-05-08)

**Freshness checklist for any datamine repo:**
1. Last commit date — must be from late April 2026 or later for Lord of Hatred content
2. Presence of Paladin and Warlock class data (`Power/Paladin_*`, `Power/Warlock_*`)
3. Season 13 mechanics confirmed present: War Plans, Horadric Cube
4. Additional Season 13 mechanics to check (unverified at access date): Talisman, Echoing
   Hatred, native Loot Filter — confirm presence and naming in datamine data

Stale repos that stopped updating before Lord of Hatred (including `blizzhackers/d4data`) are
tagged `broken / stale` for Season 13 purposes.

---

## Open Items

- Season 13 patch version string confirmed: `3.0.1.71747` (extracted from DiabloTools/d4data
  build metadata, accessed 2026-05-08).
- Confirm exact Lord of Hatred expansion launch date — "late April 2026" is inferred from
  Maxroll coverage dated May 6; confirm via Blizzard official announcement or patch notes.
- Re-test `https://blizzhackers.dev` — connection timed out at access date; confirm whether
  the data browser is still operational or permanently offline.
- Paladin and Warlock class data confirmed present in `DiabloTools/d4data` at build 3.0.1.71747:
  `json/base/meta/PlayerClass/Paladin.pcl.json`, `json/base/meta/PlayerClass/Warlock.pcl.json`,
  `json/base/meta/SkillKit/Paladin.skl.json`, `json/base/meta/SkillKit/Warlock.skl.json`,
  `json/base/meta/ParagonBoard/Paragon_Paladin_*.pbd.json`,
  `json/base/meta/ParagonBoard/Paragon_Warlock_*.pbd.json`. All 24 Paladin and 24 Warlock skill
  Power files verified present. Full per-entry audit in `docs/datamine-verification-2026-05-08.md`.
- Find the current Blizzhackers Discord invite link (check the GitHub README).
- Verify CascExplorer and CascLib repo URLs are correct and projects are still maintained.
- Determine whether TACTLib is actively maintained and preferred over CascLib for D4 CASC access.
- Investigate whether any community HTTP API wrapping `DiabloTools/d4data` is live (e.g., a hosted
  version of the `blizzhackers.dev` browser that exposes queryable endpoints).
- Clarify the Maxroll.gg internal API path structure via browser devtools inspection — what JSON
  endpoints are called when loading the planner? (Note: scraping violates ToS; this is for reference.)
- Confirm whether `danparizher/maxroll-d4-scraper` is updated for Season 13 content.
