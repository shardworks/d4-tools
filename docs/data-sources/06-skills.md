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
classes. Skill and paragon catalog data was seeded from build-guide cross-reference (Icy Veins,
Mobalytics, Maxroll, d4guides.gg) as permitted by the spec's "build-guide cross-reference allowed"
clause. The DiabloTools/d4data Power/ directory is confirmed to contain Paladin and Warlock entries
(build 3.0.1.71747), but individual skill files were not directly extracted for this seed; the
build-guide references name the same skills that appear in the datamine.

**Paladin:**
- Primary attribute: Strength (confirmed per Icy Veins class guide and community sources)
- Resource system: **Faith** (confirmed — Icy Veins skill guide lists Holy Bolt as a "Faith
  generator"; FextraLife Paladin wiki: "Faith — unique class resource that regenerates over time")
- Skill tree: Six categories — Basic, Core, Aura, Valor, Justice, Ultimate
- Skill tree categories (slugified): `basic`, `core`, `aura`, `valor`, `justice`, `ultimate`
- Season 13 note: Paladin has no key-passive skill tree node; the Oath system (Juggernaut, Zealot,
  Judicator, Disciple) is a separate class mechanic that modifies skill behavior.
- provenance: `build-guide reference`
- verification: `referenced from Icy Veins, Mobalytics, Maxroll, d4guides.gg (accessed 2026-05-08)`

**Warlock:**
- Primary attribute: Intelligence (confirmed per Icy Veins class guide and community sources)
- Resource system: **Wrath** (primary resource, spent by Core/Basic skills) and **Dominance**
  (secondary resource, spent by Archfiend/defensive summoning skills). Confirmed by Maxroll Warlock
  Class Overview and d4guides.gg Warlock database entry (accessed 2026-05-08). The resource is NOT
  "Corruption" — that name was incorrect in the prior seed.
- Skill tree: Six categories — Basic, Core, Defensive, Archfiend, Sigil, Ultimate
- Skill tree categories (slugified): `basic`, `core`, `defensive`, `archfiend`, `sigil`, `ultimate`
- Season 13 note: Warlock has no key-passive skill tree node; Soul Shards (Legion, Vanguard,
  Mastermind, Ritualist) are a separate select-one class mechanic, not skill tree entries.
- provenance: `build-guide reference`
- verification: `referenced from Icy Veins, Mobalytics, Maxroll, d4guides.gg (accessed 2026-05-08)`

**Paragon boards:** Both classes have 10 boards each (Starter + 9 named), matching the
`Paragon_{Paladin,Warlock}_00` through `_09` files confirmed present in DiabloTools/d4data.
Board names sourced from d4guides.gg class database (accessed 2026-05-08).

- Sources:
  - Icy Veins Paladin Skills Guide: `https://www.icy-veins.com/d4/guides/paladin-skills/`
  - Icy Veins Warlock Skills Guide: `https://www.icy-veins.com/d4/guides/warlock-skills/`
  - d4guides.gg Paladin: `https://d4guides.gg/en/loh/database/classes/paladin`
  - d4guides.gg Warlock: `https://d4guides.gg/en/loh/database/classes/warlock`
  - Maxroll Warlock Class Overview: `https://maxroll.gg/d4/getting-started/warlock-class-overview`
  - Mobalytics Paladin builds: `https://mobalytics.gg/diablo-4/paladin-builds`
  - Mobalytics Warlock builds: `https://mobalytics.gg/diablo-4/warlock-builds`
  - DiabloTools/d4data (datamine — class file presence confirmed, not directly extracted):
    `https://github.com/DiabloTools/d4data` (build 3.0.1.71747)

---

## Open Items

- Find the Paragon Glyph definition path in the datamine repo.
- Clarify the per-rank scaling formula: how `nRankScale` in the Power definition maps to actual
  per-rank value increases.
- Determine whether skill tag data (`arTagsGranted`) is complete in the datamine or requires
  supplemental string-table lookup for display names.
- Locate the Paragon Board node definitions path in `DiabloTools/d4data`.
- Verify whether any existing planners expose a documented skill-tree URL schema that could be
  parsed for build import (Maxroll planner URL structure).
