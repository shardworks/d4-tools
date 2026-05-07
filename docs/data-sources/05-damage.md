# 05 — Damage / DPS Formula

```
Verified against: Lord of Hatred expansion / Season 13 (Season of Reckoning) / patch number unconfirmed — see Open Items / accessed 2026-05-07
```

This document covers sources for D4's damage formula and the multiplicative damage-bucket model.
Where theorycraft sources disagree, both positions are cited and the disagreement is flagged
`community-disputed`. No math is re-derived here; all positions are attributed to their source.

---

## 1. Damage Formula Overview

D4's damage system uses a product of multiplicative buckets. The general formula takes the form:

```
Final Damage = Base Damage
             × [Additive Bucket: Skill%, Weapon%, +X% Damage, etc.]
             × [Critical Strike multiplier if crit]
             × [Vulnerable multiplier if target is Vulnerable]
             × [Overpower multiplier if Overpower proc]
             × [Additional multiplicative buckets — see §2]
             × [Enemy Defense reduction]
             × [Resistances / Armor reduction]
```

The exact bucket assignment — which affixes and passives go into which multiplier — is the primary
subject of theorycraft research and community dispute.

Sources in this doc are tagged `provenance: theorycraft` where they represent community-derived
understanding rather than extracted game data.

---

## 2. Primary Theorycraft Sources

### 2.1 Maxroll — In-Depth Damage Guide

The most widely cited comprehensive damage guide for D4. Covers the multiplicative bucket model,
additive vs multiplicative stacking, Critical Strike, Vulnerable, Overpower, Core Skill bonuses,
and how they interact.

- URL: `https://maxroll.gg/d4/resources/in-depth-damage-guide`
- Accessed: 2026-05-07
- Patch: last updated **June 29, 2025 (Season 9)** — not yet updated for Season 13
- provenance: `theorycraft`
- verification: `verified working` (HTTP 200; page title "In-Depth Damage Guide in Diablo 4 - Maxroll.gg D4", last-updated date June 29, 2025 confirmed at access date)
- Authors: Avarilyn (written), Icytroll (maintained), Northwar (reviewed) — confirmed from page credits

**Key claims (as of Season 9; verify for Season 13):**
- Damage buckets are multiplicative with each other; stats within a bucket add together
- `+% Core Skill Damage` and `+% [Skill Name] Damage` are typically in the same bucket
- Vulnerable Damage is a separate multiplier (~20% base; can be increased by affixes)
- Critical Strike Damage is a separate multiplier (50% base; scales with `+% Critical Strike Damage`)
- Overpower is an entirely separate damage event, not a multiplier on the standard chain

**ToS:** Read-only reference. Maxroll ToS prohibit scraping.

---

### 2.2 Maxroll — Attack Speed Mechanics

Covers the attack-speed stat, its interaction with animation breakpoints, and the resulting
actual Attacks per Second values per class.

- URL: `https://maxroll.gg/d4/resources/attack-speed-mechanics`
- Accessed: 2026-05-07
- Patch: last updated **January 7, 2026 (Season 11)** — not yet updated for Season 13 / Paladin / Warlock
- provenance: `theorycraft`
- verification: `verified working` (HTTP 200; page title "Attack Speed Mechanics in Diablo 4 - Maxroll.gg D4", last-updated January 7, 2026 confirmed at access date)
- Authors: Avarilyn (written), Icytroll (maintained), Northwar (reviewed) — confirmed from page credits

**Key claims (as of Season 11):**
- D4 uses frame-based animation; attack speed stat increases frames-per-animation
- Actual APS values are discrete (breakpoints); see `07-breakpoints.md` for tables
- Additive attack speed affixes all go into one bucket before the frame calculation

**ToS:** Read-only reference. Maxroll ToS prohibit scraping.

---

### 2.3 Rob2628 (RobBic) — Season 13 Cheat Sheet

D4Builds.gg host Rob2628's per-season cheat sheets, which provide practical build optimization
advice including damage-priority rankings.

- URL: `https://d4builds.gg/cheat-sheet/`
- Accessed: 2026-05-07
- Patch: Season 13 (confirmed current)
- provenance: `theorycraft`
- verification: `verified working` (HTTP 200; page title "Rob2628's Diablo 4 S13 Cheat Sheet · D4 Builds" confirmed at access date)

The cheat sheet summarizes which damage buckets matter most for each class and build archetype.
It is practically oriented (which affixes to prioritize) rather than mechanically exhaustive.

**ToS:** D4Builds.gg ToS prohibit scraping. Read-only reference.

---

### 2.4 Mekuna — Class-Specific Damage Analysis

Mekuna publishes build guides on Mobalytics.gg with per-class damage optimization detail.
Season 13 content includes Warlock and Sorcerer guides.

- URL: `https://mobalytics.gg/diablo-4/mekuna`
- Accessed: 2026-05-07
- Patch: Season 13 (builds dated May 1–6, 2026 confirmed present at access date)
- provenance: `theorycraft`
- verification: `verified working` (HTTP 200; Season 13 builds and Warlock content confirmed at access date)

Mekuna is described as "World Top Sorcerer" and provides damage priority rankings in build guides.
No standalone spreadsheet or formula document was found — damage analysis is embedded in build
guides rather than published separately.

**ToS:** Mobalytics ToS. Read-only reference.

---

## 3. Bucket Assignments (Community-Disputed Positions)

The bucket assignment for specific affixes is the primary area of community dispute. The following
positions have been documented; the debate is marked `community-disputed` where relevant.

### 3.1 Core Skill Damage vs. Skill-Specific Damage

**Position A (Maxroll In-Depth Damage Guide, Season 9):**
`+% Core Skill Damage` and `+% [Skill Name] Damage` stack additively within the same bucket.

**Position B (community counter-position, sources vary):**
Some skill-specific damage affixes are in a separate multiplicative bucket from the general
Core Skill bucket, depending on how the internal attribute is tagged.

⚠️ community-disputed — both positions cited above; do not adjudicate. Verify against
`DiabloTools/d4data` attribute definitions and Season 13 theorycraft updates.

---

### 3.2 Vulnerable Damage Multiplier Value

**Position A (widely cited):**
Vulnerable applies a ×1.20 multiplier (20% bonus damage) as a baseline; affixes that read
"increased damage to Vulnerable enemies" increase this multiplier multiplicatively.

**Position B (post-VoH context):**
Some community members report the baseline Vulnerable multiplier was adjusted in patches
post-Vessel of Hatred. The exact current value should be confirmed from Season 13 patch notes
or current theorycraft.

⚠️ community-disputed — verify from Season 13 patch notes (note: `https://diablo4.blizzard.com/en-us/news/patch-notes` returned HTTP 404 at access date; locate working URL — see Open Items) or current theorycraft.

---

### 3.3 Overpower Mechanics

Overpower is a separate damage event (not a bucket on the normal chain) triggered by a
random proc or specific passives. Community understanding:

- Overpower uses a different formula based on current Life + Fortify
- Cannot crit in the traditional sense (has its own critical Overpower mechanic)
- Certain classes have passives that guarantee Overpower or increase its frequency

The Maxroll In-Depth Damage Guide (§2.1) covers Overpower in detail as of Season 9.
Season 13 status is unverified.

---

## 4. Datamine Sources for Damage Calculations

The `DiabloTools/d4data` attribute and formula definitions can be cross-referenced with
theorycraft to verify bucket assignments.

- URL: `https://github.com/DiabloTools/d4data`
- Accessed: 2026-05-07
- Patch: Season 13 (patch number unconfirmed; verify last-commit date)
- provenance: `datamined`
- verification: `verified working` (HTTP 200; repo confirmed live at access date)

Relevant data paths:
```
d4data/extracted/base/meta/
  Attribute/              ← attribute type definitions, stacking behavior
  DamageFormula/          ← internal formula definitions (if present)
  Power/                  ← skill/power definitions with damage coefficients
```

The `DamageFormula/` path is inferred; verify its existence. Damage coefficients in skill
definitions use internal multiplier IDs that must be cross-referenced with attribute definitions
to determine bucket assignment.

**ToS:** See `08-datamine-extracts.md §2.1`.

---

## 5. Blizzard Official Sources

Blizzard does not publish the internal damage formula. The closest official sources are:
- Patch notes at `https://diablo4.blizzard.com/en-us/news/patch-notes` — changes to damage
  modifiers, Vulnerable, and Overpower are called out in patch notes when adjusted
  - Accessed: 2026-05-07
  - provenance: `official`
  - verification: `broken / stale` (HTTP 404 at access date; URL does not resolve — see Open Items for alternative)
- In-game tooltip text — affixes say "×" or "+" but the bucket categorization is not disclosed

**ToS:** Official Blizzard site; personal reference use is unrestricted.

---

## Open Items

- Find the working Blizzard patch notes URL — `https://diablo4.blizzard.com/en-us/news/patch-notes`
  returned HTTP 404 at access date. Locate the current patch-notes path on the Blizzard site.
- Determine the current Season 13 patch version string (e.g. `3.x.x`) from the game client or
  community Discord; needed to anchor the version stamp.
- Verify current Vulnerable Damage baseline multiplier for Season 13 — the Season 9
  value (×1.20) may have been adjusted.
- Determine whether the Season 13 damage guide from Maxroll or Mobalytics has been published
  (both the In-Depth Damage Guide and Attack Speed guide predate Season 13).
- Clarify the bucket assignment dispute for Core Skill vs. Skill-Specific Damage (§3.1) against
  Season 13 `DiabloTools/d4data` attribute definitions.
- Find any published Season 13 theorycraft from Wudijo or Northwar specifically on damage buckets
  (no standalone document found during research; may be embedded in build guides).
- Confirm Overpower formula for Season 13 — any patch notes changes after Season 9?
- Determine damage formula changes for Paladin and Warlock classes (Season 13 new classes);
  their resource system names (community references suggest "Faith" and "Corruption" respectively —
  unverified; confirm in DiabloTools/d4data) may introduce new bucket types.
- Check whether a `DamageFormula/` path exists in `DiabloTools/d4data`.
