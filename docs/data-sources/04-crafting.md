# 04 — Crafting Systems

```
Verified against: Lord of Hatred expansion / Season 13 (Season of Reckoning) / patch number unconfirmed — see Open Items / accessed 2026-05-07
```

This document covers data sources for D4's crafting systems. Crafting mechanics modify or enhance
items and are central to build optimization. Season 13 / Lord of Hatred reintroduces the
Horadric Cube as a new crafting surface alongside the pre-existing systems. ("v2" is informal
community framing — confirmed present by Icy Veins and Blizzard marketing; official internal
name may differ; verify in datamine data.)

---

## 1. Crafting System Names (Stable Enum)

The following crafting systems are present in Season 13 / Lord of Hatred:

| System | Introduced | What it does |
|--------|-----------|--------------|
| Enchanting | Base game | Re-rolls one explicit affix on a Rare/Legendary/Unique |
| Tempering | Vessel of Hatred | Adds a tempered affix from a Temper Manual |
| Masterworking | Vessel of Hatred | Upgrades item power (5/10/15/20/25 tiers; rank 4/8/12 add a bonus to one affix) |
| Horadric Crafting | Lord of Hatred | Horadric Cube reintroduced; confirmed via Icy Veins/Blizzard; details below |
| Rune Socketing | Vessel of Hatred | Inserts Condition and Effect runes into sockets for triggered effects |
| Sigil Crafting | Base game | Crafts Nightmare Dungeon Sigils from materials |
| Codex of Power | Base game (Vessel of Hatred overhaul) | Aspect upgrades; not item modification per se |

- provenance: `official`

---

## 2. Datamine Sources

### 2.1 DiabloTools/d4data — Recipe and Crafting Definitions

All crafting recipe data is in the `DiabloTools/d4data` extracted files.

- URL: `https://github.com/DiabloTools/d4data`
- Accessed: 2026-05-07
- Patch: Season 13 (patch number unconfirmed; verify last-commit date)
- provenance: `datamined`
- verification: `verified working` (HTTP 200; repo confirmed live at access date)

**CASC paths (observed from community references):**

```
d4data/json/base/meta/
  Recipe/               ← crafting recipes
  CraftingTune/         ← masterworking upgrade tables
  TemperManual/         ← temper manual definitions (see 03-affixes.md §5)
  Rune/                 ← rune definitions
  EnchantingType/       ← enchanting affix pool definitions
```

**Representative example — enchanting recipe (observed shape, not canonical):**

```json
{
  "__fileName__": "Recipe_Enchanting_HelmetLegendary",
  "__snoID__": 4567890,
  "eItemQuality": "ITEM_QUALITY_LEGENDARY",
  "eItemType": "HELM",
  "arMaterialCosts": [
    { "snoItem": { "value": 111222 }, "nAmount": 5 },
    { "snoItem": { "value": 333444 }, "nAmount": 2 }
  ],
  "nGoldCost": 25000
}
```

**ToS:** See `08-datamine-extracts.md §2.1`.

---

## 3. Enchanting

Enchanting allows replacing one explicit affix on a Rare, Legendary, or Unique item. The NPC
is the Occultist.

**Mechanics (from community guides):**
- Costs gold and crafting materials (scales with item power)
- First enchant always shows two new affix options to choose from
- Subsequent enchants add the old unwanted option back to the pool
- Enchanting a second time locks the item to one slot permanently
- Unique items: limited affix pool (only Uniques' non-special affixes can be enchanted)

**Data needs for implementation:**
- Affix eligibility per item slot and class (from `Affix/` definitions — see §2.1 and `03-affixes.md`)
- Material costs per item power tier (from `Recipe/` definitions)
- Gold cost scaling formula (from `Recipe/` or theorycraft analysis)

**Sources:**
- Icy Veins crafting guides: `https://www.icy-veins.com/d4` (Season 13 content confirmed)
  - Accessed: 2026-05-07
  - provenance: `wiki`
  - verification: `verified working` (HTTP 200; "Diablo 4 Best Builds, Guides, and News - Icy Veins" confirmed at access date; Horadric Cube and Season 13 content present)
- Maxroll enchanting guide: `https://maxroll.gg/d4/resources/` (Season 13 coverage; exact path varies)
  - Accessed: 2026-05-07
  - provenance: `theorycraft`
  - verification: `verified working` (HTTP 200 for main hub; enchanting sub-page URL unverified — see Open Items)

**ToS:** Guide sites are read-only references; no ToS concerns for personal reference.

---

## 4. Tempering

Tempering adds a tempered affix to Rare and Legendary items using Temper Manuals. Each item can
hold up to two tempered affixes (different manuals). Introduced in Vessel of Hatred.

**Mechanics:**
- Temper Manuals are class-specific and affix-category-specific
- Each item has 5 tempering charges; each attempt consumes one charge
- Each temper attempt randomly selects one affix from the manual's pool
- When charges run out, the tempered affix is locked permanently

**Data needs:**
- Temper Manual definitions with affix pools (from `TemperManual/` in datamine — see `03-affixes.md §5`)
- Which Temper Manuals are available per class

**Sources:**
- `DiabloTools/d4data` (primary)
- Maxroll.gg tempering guide: `https://maxroll.gg/d4/resources/tempering-guide` (URL may vary)
  - Accessed: 2026-05-07
  - provenance: `theorycraft`
  - verification: `unverified — see Open Items`

---

## 5. Masterworking

Masterworking upgrades items through 12 tiers (introduced in Vessel of Hatred). At tiers 4, 8,
and 12, one affix receives an additional bonus. Tier 12 is called "Tempering Grade 12."

**Mechanics:**
- Each upgrade tier costs materials and gold (scales with tier)
- At tier 4: one randomly selected affix gains +5% to its max value
- At tier 8: same
- At tier 12: selected affix gains +25% to its max value
- Upgrading requires Obducite (tiers 1–4), Ingolith (5–8), Neathiron (9–12)

**Data needs:**
- Upgrade cost tables per tier (from `CraftingTune/` in datamine)
- Material definitions (from `Item/` in datamine)

**Sources:**
- `DiabloTools/d4data` (primary)
  - provenance: `datamined`
  - verification: `verified working` (repo confirmed live at access date)
- Maxroll masterworking guide: `https://maxroll.gg/d4/resources/masterworking-guide`
  - provenance: `theorycraft`
  - verification: `unverified — see Open Items`

---

## 6. Horadric Cube (Lord of Hatred)

Season 13 / Lord of Hatred reintroduced the Horadric Cube as a crafting system. Mechanics as
of Season 13 launch:

**Known mechanics (from Icy Veins / Maxroll Season 13 launch coverage):**
- Combines materials to create or modify high-end items
- Recipes unlocked through gameplay progression
- Integrates with new Echoing Hatred and War Plans systems

**Data needs:**
- Recipe definitions (from `Recipe/` or a new `HoradricCube/` path in the datamine)
- Material source locations

**Sources:**
- Icy Veins Horadric Cube guide: `https://www.icy-veins.com/d4` (Season 13 content)
  - Accessed: 2026-05-07
  - provenance: `wiki`
  - verification: `verified working` (HTTP 200; Horadric Cube and Season 13 content confirmed at access date)
- `DiabloTools/d4data` — Horadric recipe path is unconfirmed; may use existing `Recipe/` path
  or a new category. Verify in repo.
  - provenance: `datamined`
  - verification: `unverified — see Open Items`

**ToS:** New expansion content; Blizzard has not separately addressed ToS for Horadric Cube data.
Same posture as §2.1 applies.

---

## 7. Rune Socketing

Runes (introduced Vessel of Hatred) are socketed into items as Condition+Effect pairs. When the
Condition triggers, the Effect fires.

- Rune definitions: `Rune/` path in `DiabloTools/d4data`
- Socket mechanic: items have 0–2 sockets; sockets are added at the Jeweler

**Representative example — rune definition (observed shape, not canonical):**

```json
{
  "__fileName__": "Rune_Condition_OnAttack",
  "__snoID__": 7891011,
  "eRuneType": "RUNE_TYPE_CONDITION",
  "arGrantedPowers": [
    { "snoPower": { "value": 888999 } }
  ]
}
```

- provenance: `datamined`
- verification: `unverified — see Open Items`

---

## Open Items

- Confirm the Horadric Cube recipe path in `DiabloTools/d4data` — is it under `Recipe/`, a new
  `HoradricCube/` directory, or embedded in another structure?
- Verify Temper Manual and Masterworking Tune path names in the current repo.
- Determine exact material cost scaling for enchanting and masterworking per item power tier.
- Confirm Rune definition path in `DiabloTools/d4data`.
- Identify Season 13-specific Temper Manuals for Paladin and Warlock classes.
- Check whether `diablo4.life` crafting tools (aspect gambling, target farming) reflect Season 13
  or are stale (last editorial content was December 2025).
- Verify the Maxroll tempering and masterworking guide URLs for Season 13 coverage.
- Determine whether Echoing Hatred (Lord of Hatred mechanic) has craftable components or is purely
  drop-based — if craftable, add its recipe source.
