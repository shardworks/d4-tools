# 03 — Affix Data

```
Verified against: Lord of Hatred expansion / Season 13 (Season of Reckoning) / patch number unconfirmed — see Open Items / accessed 2026-05-07
```

This document covers sources for item affix data: definitions, ID catalogs, slot pools, value
ranges, and display-string formats. Full affix tables are not inlined (see README §2.8 — volatile
data stays at-source). Sources include the datamine repo, community scrapers, and build planners.

---

## 1. Affix Overview

Affixes are the primary stat-granting attributes on equipment. Each item carries:

- **Implicit affixes:** Built-in properties determined by item type (e.g., shields always have
  Block Chance). Cannot be replaced via enchanting.
- **Explicit affixes (regular):** 1–4 regular affixes rolled on item generation. Can be
  re-rolled via enchanting (one at a time).
- **Tempered affixes:** Added via the Tempering system post-Vessel of Hatred. A separate affix
  slot added by the player using Temper Manuals.
- **Greater Affix marker:** A gold star (`★`) on an affix indicating it rolled in the top tier
  of its range. No change to the affix pool, only the value within range.

Affixes have:
- A numeric internal ID (`__snoID__`)
- A string key (`__fileName__`)
- A value range (min/max float or int)
- An affix type (regular, legendary power, implicit, etc.)
- Class and slot restrictions (which classes and item slots can carry it)
- A display-string template (from the string tables)

---

## 2. Datamine Source

### 2.1 DiabloTools/d4data — Affix Definitions

The authoritative source for affix IDs and definitions.

- URL: `https://github.com/DiabloTools/d4data`
- Data browser: `https://blizzhackers.dev` (timed out at access date — see Open Items)
- Accessed: 2026-05-07
- Patch: Season 13 (patch number unconfirmed; verify last-commit date)
- provenance: `datamined`
- verification: `verified working` (HTTP 200; repo confirmed live at access date)

**CASC path (observed):**

```
d4data/extracted/base/meta/Affix/
```

**Representative example — affix definition (observed shape, not canonical):**

```json
{
  "__fileName__": "Affix_Str_AddLifePercent",
  "__snoID__": 1234567,
  "eAffixType": "AFFIX_TYPE_LEGENDARY",
  "arAffixSkillTagRequirements": [],
  "arItemTypesAllowed": ["HELM", "CHEST", "GLOVES", "PANTS", "BOOTS"],
  "arClassesAllowed": [],
  "ptItemAffixAttributes": [
    {
      "tAttribute": {
        "eAttribute": "Attr_Max_Life_Percent",
        "nParam": 0
      },
      "afValue": [0.08, 0.14]
    }
  ]
}
```

The `afValue` array is `[min, max]`. The display string for this affix is resolved by:
1. Looking up `Affix_Str_AddLifePercent` in the string table
2. Substituting `{VALUE:1}` with the rolled value, scaled to a percentage

**ToS:** See `08-datamine-extracts.md §2.1`.

---

## 3. String Table (Display Text)

Affix display strings are in the `StringList` / `enUS_Text` exports.

- URL: `https://github.com/DiabloTools/d4data` (same repo, `enUS_Text/` path)
- Accessed: 2026-05-07
- provenance: `datamined`
- verification: `verified working` (repo confirmed live at access date)

**Observed shape:**

```json
{
  "id": "Affix_Str_AddLifePercent",
  "szLabel": "+[{VALUE:1}]% Maximum Life",
  "hLabel": 3412567890
}
```

Interpolation tokens:
- `{VALUE:1}` — first value, formatted as a number
- `{VALUE:1|%}` — first value, formatted as a percentage
- `|1|,|,|` — delimiter syntax for multi-value display (min–max ranges)

---

## 4. Processed Community Sources

### 4.1 maxroll-d4-scraper (community tool)

Produces `affix_map.json` — a processed, more human-readable affix catalog scraped from Maxroll.

- URL: `https://github.com/danparizher/maxroll-d4-scraper`
- Accessed: 2026-05-07
- Patch: Season 13 coverage unknown (verify commit history)
- provenance: `planner` (scrapes Maxroll, which consumes datamine data)
- verification: `verified working` (HTTP 200; repo confirmed live with ~7 stars, 90 commits at access date; Season 13 coverage unconfirmed)

**Observed shape of `affix_map.json` (community-referenced, not canonical):**

```json
{
  "Affix_Str_AddLifePercent": {
    "id": "Affix_Str_AddLifePercent",
    "name": "+[X]% Maximum Life",
    "ranges": [
      { "min": 8.0, "max": 14.0 }
    ],
    "slots": ["Helm", "Chest", "Gloves", "Pants", "Boots"],
    "classes": []
  }
}
```

**ToS:** Scraping Maxroll violates their ToS. Prefer `DiabloTools/d4data` for raw data.
The processed shape here is documented for orientation purposes only.

---

### 4.2 Maxroll.gg Affix Database (HTML)

Maxroll provides an affix browser at `https://maxroll.gg/d4/affixes` (path may vary).

- URL: `https://maxroll.gg/d4`
- Accessed: 2026-05-07
- Patch: Season 13 (Maxroll coverage dated May 6, 2026 confirmed)
- provenance: `planner`
- verification: `verified working` (HTTP 200 confirmed at access date; exact affix-browser sub-path unverified — see Open Items)

Human-readable; not a queryable API. Content is rendered HTML; affix tables can be read for
reference and spot-checking against the datamine data.

**ToS:** Maxroll ToS prohibit scraping. Reference use only.

---

## 5. Tempered Affix Sources (Vessel of Hatred+)

Tempering adds a separate affix to Rare, Legendary, and Unique items using Temper Manuals.
Tempered affixes are distinct from the regular affix pool.

The `DiabloTools/d4data` repo should contain Temper Manual definitions under:

```
d4data/extracted/base/meta/TemperManual/
```

**Observed shape (community-referenced):**

```json
{
  "__fileName__": "TemperManual_Barbarian_WeaponDamage",
  "__snoID__": 9876543,
  "eClass": "CLASS_BARBARIAN",
  "arAffixPool": [
    { "snoAffix": { "value": 1234567 }, "fWeight": 1.0 },
    { "snoAffix": { "value": 2345678 }, "fWeight": 1.0 }
  ]
}
```

- provenance: `datamined`
- verification: `unverified — see Open Items` (TemperManual path is inferred from community
  references; verify in actual repo)

**ToS:** See `08-datamine-extracts.md §2.1`.

---

## Open Items

- Verify the exact CASC path for Affix definitions in `DiabloTools/d4data` (`Affix/` vs `ItemAffix/`
  or similar — naming varies by game version).
- Confirm the TemperManual definition path and observed JSON shape for Season 13 tempered affixes.
- Determine whether Season 13 / Lord of Hatred introduced new affix types for Paladin/Warlock.
- Confirm whether Greater Affix is tracked in the datamine data or only visible in-game.
- Verify that `danparizher/maxroll-d4-scraper` covers Season 13 affix pools.
- Find the correct Maxroll affix-browser URL path (`/d4/affixes`, `/d4/database/affixes`, or other).
- Clarify the full interpolation-token syntax in affix display strings — document all observed token
  forms beyond `{VALUE:1}`.
- Determine whether affix class/slot restrictions are stored in the Affix JSON or derived from
  separate ItemType and Class definitions.
