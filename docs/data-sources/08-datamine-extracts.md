# 08 — Datamine Extracts

```
Verified against: Lord of Hatred expansion / Season 13 (Season of Reckoning) / 3.0.1c / accessed 2026-05-07
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
- Patch: Season 13 / Lord of Hatred — actively maintained (863+ commits as of access date)
- provenance: `datamined`
- verification: `verified working`

**Data browser:** `https://blizzhackers.dev` — a web interface for browsing the extracted data.
- URL: `https://blizzhackers.dev`
- Accessed: 2026-05-07
- provenance: `datamined`
- verification: `verified working` (browser works; serves DiabloTools/d4data content)

**Coverage (observed from community references and repository structure):**

The repo provides JSON exports organized into directories matching internal game data categories:

```
d4data/
  extracted/
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

**Season 13 / Lord of Hatred coverage:** Dataminers successfully extracted Paladin and Warlock
class data ahead of the Lord of Hatred expansion announcement (April 28, 2026). The repo is
expected to track the Season 13 patch cycle; verify the last-commit date before use.

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
- verification: `verified working` (GitHub repo is live; ~7 stars, described as work in progress)

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
- verification: `verified working` (data present in `DiabloTools/d4data`)

---

## 5. Patch Freshness Protocol

The load-bearing property for any datamine repo is whether it tracks the **current season and patch**.

**Season 13 anchor points:**
- Lord of Hatred expansion launched: April 28, 2026
- Two new classes: Paladin, Warlock
- Current patch: 3.0.1c (Build #71858) as of 2026-05-07

**Freshness checklist for any datamine repo:**
1. Last commit date — must be 2026-04-28 or later for Lord of Hatred content
2. Presence of Paladin and Warlock class data (`Power/Paladin_*`, `Power/Warlock_*`)
3. New Season 13 mechanics: War Plans, Horadric Cube (version 2), Talisman, Echoing Hatred,
   native Loot Filter

Stale repos that stopped updating before Lord of Hatred (including `blizzhackers/d4data`) are
tagged `broken / stale` for Season 13 purposes.

---

## Open Items

- Confirm `DiabloTools/d4data` last-commit date and verify it tracks the Season 13 / 3.0.1c patch.
- Verify whether Paladin and Warlock class data is present in `DiabloTools/d4data`.
- Find the current Blizzhackers Discord invite link (check the GitHub README).
- Verify CascExplorer and CascLib repo URLs are correct and projects are still maintained.
- Determine whether TACTLib is actively maintained and preferred over CascLib for D4 CASC access.
- Investigate whether any community HTTP API wrapping `DiabloTools/d4data` is live (e.g., a hosted
  version of the `blizzhackers.dev` browser that exposes queryable endpoints).
- Clarify the Maxroll.gg internal API path structure via browser devtools inspection — what JSON
  endpoints are called when loading the planner? (Note: scraping violates ToS; this is for reference.)
- Confirm whether `danparizher/maxroll-d4-scraper` is updated for Season 13 content.
