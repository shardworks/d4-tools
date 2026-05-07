# 06 — Skill Data

```
Verified against: Lord of Hatred expansion / Season 13 (Season of Reckoning) / patch number unconfirmed — see Open Items / accessed 2026-05-07
```

This document covers sources for D4 skill data: skill definitions, ranks, upgrades (Enhanced /
Ultimate / etc.), damage coefficients, resource costs, cooldowns, scaling tags, and passive nodes.
All eight classes are in scope, including Season 13's Paladin and Warlock.

---

## 1. Skill System Overview

Each class has a skill tree with:
- **Active skills:** Categorized by type (Basic, Core, Defensive, Conjuration/Macabre/Companion/
  Brawling/Weapon Mastery/Etc., Ultimate, Key Passive)
- **Passive nodes:** Small stat bonuses and conditional effects woven between skill nodes
- **Upgrade paths:** Each active skill has two upgrade choices (e.g., Enhanced Fireball →
  Wizard's Fireball or Destructive Fireball); unlocked by spending skill points

Skill data is stored as **Power** definitions in the game files (internal name `Power/`).

---

## 2. Datamine Sources

### 2.1 DiabloTools/d4data — Power Definitions

The primary source for skill data. All skills are stored as Power definitions.

- URL: `https://github.com/DiabloTools/d4data`
- Data browser: `https://blizzhackers.dev` (timed out at access date — see Open Items)
- Accessed: 2026-05-07
- Patch: Season 13 (patch number unconfirmed; verify last-commit date; Paladin/Warlock data was
  reportedly extracted ahead of the Lord of Hatred expansion launch)
- provenance: `datamined`
- verification: `verified working` (HTTP 200; repo confirmed live at access date)

**CASC path:**

```
d4data/extracted/base/meta/Power/
```

**Representative example — skill definition (observed shape, not canonical):**

```json
{
  "__fileName__": "Sorc_Active_Fireball",
  "__snoID__": 3456789,
  "eClass": "CLASS_SORCERER",
  "ePowerType": "POWER_TYPE_ACTIVE",
  "eSkillCategory": "SKILL_CATEGORY_CORE",
  "arTagsGranted": ["Fire", "Pyromancy", "Projectile"],
  "arScalingAttributes": [
    {
      "eAttribute": "Attr_Skill_Damage_Percent",
      "fScaleValue": 0.85,
      "nRankScale": 4
    }
  ],
  "fResourceCost": 30.0,
  "fCooldownDuration": 0.0,
  "nMaxRank": 5
}
```

The `arScalingAttributes` array contains the per-rank scaling for damage and other values.
`nRankScale` describes how the value changes per skill point invested.

**ToS:** See `08-datamine-extracts.md §2.1`.

---

### 2.2 String Table — Skill Display Names and Descriptions

Skill display text and upgrade descriptions are in the `StringList` / `enUS_Text` exports.

- URL: `https://github.com/DiabloTools/d4data` (same repo, `enUS_Text/` path)
- Accessed: 2026-05-07
- provenance: `datamined`
- verification: `verified working` (repo confirmed live at access date)

Display strings for skill descriptions contain the same `{VALUE:1}` interpolation tokens as
affix strings (see `03-affixes.md §3`). Skill descriptions also use rank-specific value ranges:
e.g., `"Deals [{SKILL_DAMAGE}]% weapon damage"` where `{SKILL_DAMAGE}` is substituted from
the scaling table.

---

## 3. Community / Wiki Sources

### 3.1 Maxroll.gg — Class Build Guides

Maxroll hosts build guides for all 10 classes under `https://maxroll.gg/d4`. These include
skill tree configurations, skill rankings, and notation of which upgrades are chosen.

- URL: `https://maxroll.gg/d4`
- Accessed: 2026-05-07
- Patch: Season 13 (Maxroll coverage dated May 6, 2026 confirmed)
- provenance: `theorycraft`
- verification: `verified working` (HTTP 200 confirmed at access date)

Maxroll's planner at `https://maxroll.gg/d4/planner/` allows encoding a full skill tree in a
shareable URL. The URL encodes skill selections as query parameters; the schema can be inferred
by inspecting links from build guides.

**ToS:** Read-only reference. Maxroll ToS prohibit scraping.

---

### 3.2 D4Builds.gg — Skill Tree Planner

D4Builds.gg at `https://d4builds.gg` includes a skill tree planner and Rob2628's per-class
skill priority tiers in the S13 Cheat Sheet.

- URL: `https://d4builds.gg`
- Accessed: 2026-05-07
- Patch: Season 13 (confirmed current)
- provenance: `theorycraft, planner`
- verification: `verified working` (HTTP 200; S13 content confirmed at access date)

**ToS:** D4Builds.gg ToS prohibit scraping. Read-only reference.

---

### 3.3 Mobalytics — Mekuna Class Guides

Mekuna (hosted on Mobalytics) provides skill tree breakdowns for each class including Season 13
Paladin and Warlock.

- URL: `https://mobalytics.gg/diablo-4/mekuna`
- Accessed: 2026-05-07
- Patch: Season 13 (builds dated May 1–6, 2026 confirmed present at access date)
- provenance: `theorycraft`
- verification: `verified working` (HTTP 200; Season 13 builds and Warlock content confirmed at access date)

**ToS:** Mobalytics ToS. Read-only reference.

---

### 3.4 Icy Veins — Class Guides

- URL: `https://www.icy-veins.com/d4`
- Accessed: 2026-05-07
- Patch: Season 13
- provenance: `wiki`
- verification: `verified working` (HTTP 200; "Diablo 4 Best Builds, Guides, and News - Icy Veins" confirmed at access date)

**ToS:** Read-only reference.

---

## 4. Paragon Board Skills (Glyphs)

Paragon boards extend the skill system via board nodes, sockets for Glyphs, and rare/magic nodes.
Glyph definitions are a separate data type from Power definitions.

- CASC path (inferred): `d4data/extracted/base/meta/ParagonGlyph/` or similar
- provenance: `datamined`
- verification: `unverified — see Open Items`

Glyphs have a level (1–21 with 5-star max) and grant bonuses based on surrounding board node
counts (Strength/Dex/Int/Willpower nodes within radius). The scaling formula is in the glyph
definition.

---

## 5. Season 13 New Classes — Paladin and Warlock

Lord of Hatred (Season 13, late April 2026 — exact launch date unconfirmed) introduced two new
classes. Their presence in Season 13 content is confirmed by live planner sites; class-specific
details below are from community references and have not been verified against the datamine.

**Paladin:**
- Resource system: Faith ⚠️ `unverified name — confirm in DiabloTools/d4data Power/ path`
- Skill tree: includes Shield skills, Holy damage, Aura passives (based on community references
  and Icy Veins launch guides)
- datamine status: unconfirmed; reportedly extracted ahead of the expansion launch
- verification: `unverified — confirm in DiabloTools/d4data Power/ path`

**Warlock:**
- Resource system: Corruption ⚠️ `unverified name — confirm in DiabloTools/d4data Power/ path`
- Skill tree: Curses, Shadow/Chaos damage (based on Mekuna's Season 13 Warlock guide on
  Mobalytics and Icy Veins launch coverage)
- datamine status: unconfirmed; reportedly extracted ahead of the expansion launch
- verification: `unverified — confirm in DiabloTools/d4data Power/ path`

- provenance: `datamined` (for raw definitions); `theorycraft` (for resource system names and skill tree details)
- Sources:
  - Mekuna Warlock guide: `https://mobalytics.gg/diablo-4/mekuna`
  - Icy Veins D4: `https://www.icy-veins.com/d4`
  - DiabloTools/d4data: `https://github.com/DiabloTools/d4data`

---

## Open Items

- Confirm Paladin and Warlock skill data is present in `DiabloTools/d4data` Power/ directory
  (datamined ahead of launch; verify post-launch patch coverage).
- Determine exact internal names for Paladin and Warlock resource types.
- Find the Paragon Glyph definition path in the datamine repo.
- Clarify the per-rank scaling formula: how `nRankScale` in the Power definition maps to actual
  per-rank value increases.
- Determine whether skill tag data (`arTagsGranted`) is complete in the datamine or requires
  supplemental string-table lookup for display names.
- Locate the Paragon Board node definitions path in `DiabloTools/d4data`.
- Verify whether any existing planners expose a documented skill-tree URL schema that could be
  parsed for build import (Maxroll planner URL structure).
