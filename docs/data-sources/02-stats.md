# 02 — Game Stats Catalog

```
Verified against: Lord of Hatred expansion / Season 13 (Season of Reckoning) / patch 3.0.1.71747 / accessed 2026-05-08
```

This document covers sources for the D4 game-stats catalog: primary and secondary stat definitions,
damage types, rarity tiers, and item-slot enumeration. Small stable canonical enums are inlined
here (see README §2.8); the full stat catalog is at-source only.

---

## 1. Stable Canonical Enums (inlined)

The following enums change rarely across patches and are safe to inline. Verify against the datamine
source after any major patch.

### 1.1 Damage Types

Six elemental damage types in Season 13:

| Type | Internal ID (observed) | Notes |
|------|------------------------|-------|
| Physical | `DamageType_Physical` | Gray/white in UI |
| Fire | `DamageType_Fire` | |
| Cold | `DamageType_Cold` | |
| Lightning | `DamageType_Lightning` | |
| Poison | `DamageType_Poison` | |
| Shadow | `DamageType_Shadow` | |

- provenance: `datamined`
- Source: `DiabloTools/d4data` attribute enum definitions

### 1.2 Item Rarity Tiers

Six rarity tiers used in Season 13:

| Rarity | Internal Name | Notes |
|--------|---------------|-------|
| Common | `Normal` | White |
| Magic | `Magic` | Blue |
| Rare | `Rare` | Yellow |
| Legendary | `Legendary` | Orange |
| Unique | `Unique` | Brown / dark amber-gold |
| Mythic Unique | `Mythic` | Red (warm side) |

Plus the **Ancestral** prefix (applies to Legendary and Unique; not a rarity tier, a power tier).

- provenance: `datamined`
- Source: `DiabloTools/d4data` item quality enum

### 1.3 Item Slots

Standard D4 equipment slots:

| Slot | Notes |
|------|-------|
| Helm | |
| Chest Armor | |
| Gloves | |
| Pants | |
| Boots | |
| Amulet | |
| Ring 1 | |
| Ring 2 | |
| Weapon (Main Hand) | Class-dependent: 1H sword, axe, mace, scythe, dagger, wand, staff, bow, crossbow, etc. |
| Offhand | Class-dependent: shield, focus, totem, wand (Sorcerer), 2H weapon (Barbarian uses two 2H slots) |

Barbarian has unique dual-2H-wielding allowing up to 4 weapon slots total. Verify slot structure
for Paladin and Warlock (Season 13 new classes).

- provenance: `datamined, official`

---

## 2. Primary Stats

### 2.1 Core Attributes

D4 has four primary attributes:

| Attribute | Primary bonus | Secondary bonus |
|-----------|--------------|-----------------|
| Strength | Overpower damage (all classes) | Armor (Barbarian, Druid) |
| Intelligence | Skill damage (all classes) | Resistance to all elements |
| Willpower | Healing received, Fortify generation | Overpower damage (Druid, Necromancer, Spiritborn) |
| Dexterity | Lucky Hit Chance (all classes) | Dodge Chance (Rogue) |

Each class has one primary attribute that scales its main damage. Assignment:
- Barbarian → Strength
- Druid → Willpower
- Necromancer → Intelligence
- Rogue → Dexterity
- Sorcerer → Intelligence
- Spiritborn → Willpower
- Paladin → Strength  *(datamine-confirmed: `PlayerClass/Paladin.pcl.json`, `tPrimaryAttribute = Attribute_Strength`)*
- Warlock → Intelligence  *(datamine-confirmed: `PlayerClass/Warlock.pcl.json`, `tPrimaryAttribute = Attribute_Intelligence`)*

- provenance: `official, wiki` (Barbarian–Spiritborn); `datamined` (Paladin, Warlock — DiabloTools/d4data build 3.0.1.71747, accessed 2026-05-08)

**Sources:**
- Blizzard game guide: `https://diablo4.blizzard.com/en-us/` (marketing hub; game guide pages linked)
- wiki.gg D4: `https://diablo.wiki.gg/wiki/Attributes` (HTTP 401 on root as of 2026-05-07; verify sub-path)
  - Accessed: 2026-05-07
  - verification: `unverified — see Open Items`
- DiabloTools/d4data `json/base/meta/PlayerClass/` (Paladin and Warlock only)
  - Accessed: 2026-05-08
  - verification: `verified — build 3.0.1.71747`

**ToS (Blizzard game guide):** Public marketing content; personal reference use is unrestricted.
**ToS (wiki.gg):** Wiki.gg content is community-maintained. Game data on the wiki is Blizzard's
intellectual property; personal reference use is acceptable.

### 2.2 Secondary Stats

Secondary stats calculated from primary attributes and gear affixes include:

- Attack Speed, Attacks per Second
- Critical Strike Chance (cap: community-disputed — see §3 and `07-breakpoints.md`)
- Critical Strike Damage
- Vulnerable Damage
- Overpower Damage, Overpower Chance
- Cooldown Reduction
- Damage Reduction (vs. Close / Distant / Burning / Crowd Controlled)
- Armor, Resistances (6 elements)
- Maximum Life, Fortify
- Dodge Chance
- Resource Generation, Resource Cost Reduction
- Movement Speed (cap at 200% total — verify for Season 13)
- Lucky Hit Chance

For the complete list with internal attribute IDs, the authoritative source is the `Affix/` and
attribute definitions in `DiabloTools/d4data`.

- provenance: `datamined`
- Source: `DiabloTools/d4data`
  - URL: `https://github.com/DiabloTools/d4data`
  - Accessed: 2026-05-07
  - verification: `verified working` (repo confirmed live at access date)

---

## 3. Full Stat Catalog (at-source)

The complete catalog of game attributes (internal IDs, value types, min/max ranges) is in the
`DiabloTools/d4data` extracted files:

```
d4data/json/base/meta/
  Attribute/              ← attribute definitions
  AttributeComponent/     ← compound attributes
  ItemType/               ← item type / slot definitions
```

**Representative example — attribute definition (observed shape, not canonical):**

```json
{
  "__fileName__": "Attr_Critical_Strike_Chance",
  "__snoID__": 567890,
  "eAttributeDataType": "ATTRIBUTE_DATA_TYPE_FLOAT",
  "fMinValue": 0.0,
  "fMaxValue": 1.0,
  "bIsPercentage": true,
  "szTooltip": "Lucky Hit Chance: #{value}%"
}
```

- URL: `https://github.com/DiabloTools/d4data`
- Accessed: 2026-05-07
- Patch: Season 13 (verify last-commit date for current patch coverage)
- provenance: `datamined`
- verification: `verified working` (HTTP 200; repo confirmed live with 33 stars, 863+ commits at access date)

**ToS:** See `08-datamine-extracts.md §2.1`.

---

## 4. Maxroll Mechanics Guides

Maxroll.gg hosts authoritative mechanic explanations that describe how stats interact:

- **In-Depth Damage Guide** — covers how all damage stats combine:
  `https://maxroll.gg/d4/resources/in-depth-damage-guide`
  - Accessed: 2026-05-07
  - Patch: last updated June 29, 2025 (Season 9); not yet updated for Season 13 (confirmed from page)
  - provenance: `theorycraft`
  - verification: `verified working` (HTTP 200; page title "In-Depth Damage Guide in Diablo 4 - Maxroll.gg D4" confirmed at access date)

- **Attack Speed Mechanics** — attack-speed stat, breakpoints, frame data:
  `https://maxroll.gg/d4/resources/attack-speed-mechanics`
  - Accessed: 2026-05-07
  - Patch: last updated January 7, 2026 (Season 11); not yet updated for Season 13 (confirmed from page)
  - provenance: `theorycraft`
  - verification: `verified working` (HTTP 200; page title "Attack Speed Mechanics in Diablo 4 - Maxroll.gg D4" confirmed at access date)

**ToS (Maxroll):** Maxroll ToS prohibit scraping. Read these as reference; do not automate
fetching of their guide content.

---

## Open Items

- Verify whether a Critical Strike Chance hard cap exists in Season 13 and what it is — historically
  100% cap, but some community sources discuss effective caps; see `07-breakpoints.md`.
- Confirm the Movement Speed cap in Season 13 (historically 200%; verify not changed with
  Lord of Hatred content or new class mechanics).
- Verify that `diablo.wiki.gg/wiki/Attributes` sub-path is accessible despite the root 401.
- Determine whether Season 13 introduced any new stat types tied to new mechanics (War Plans,
  Talisman, Echoing Hatred).
- Check if the In-Depth Damage Guide and Attack Speed Mechanics articles on Maxroll have been
  updated for Season 13 / Lord of Hatred.
