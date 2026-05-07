# 07 — Breakpoints / Diminishing Returns

```
Verified against: Lord of Hatred expansion / Season 13 (Season of Reckoning) / 3.0.1c / accessed 2026-05-07
```

This document covers sources for D4's breakpoint mechanics — the discrete jump points in
frame-based systems (primarily attack speed) — and diminishing-returns curves (Cooldown Reduction,
Critical Strike Chance, etc.). Where theorycraft sources disagree, both positions are cited and
the disagreement is flagged `community-disputed`. Math is not re-derived; sources are cited.

---

## 1. Breakpoint Mechanics Overview

D4 uses server tick rates and animation frame counts to determine actual event timing. Two
distinct breakpoint classes exist:

1. **Frame breakpoints (attack speed):** The game renders animations in discrete frames. Attack
   speed increases change which frame-count tier you occupy, producing step-function behavior.
   More attack speed does nothing until the next breakpoint; at the breakpoint, APS jumps.

2. **Soft caps / Diminishing returns:** Some stats (Cooldown Reduction, resistances) apply
   diminishing returns above a threshold so that stacking becomes progressively less effective.
   This is distinct from a hard cap.

---

## 2. Attack Speed Breakpoints

### 2.1 Maxroll — Attack Speed Mechanics (primary source)

The most detailed public source for D4 attack-speed breakpoints, with per-class per-weapon-type
frame tables.

- URL: `https://maxroll.gg/d4/resources/attack-speed-mechanics`
- Accessed: 2026-05-07
- Patch: last updated **January 7, 2026 (Season 11)** — **not yet updated for Season 13 /
  Paladin / Warlock** (two new classes added April 2026)
- provenance: `theorycraft`
- verification: `verified working`
- Authors: Avarilyn, reviewed by Northwar

**Key claims (as of Season 11; verify for Season 13):**

- D4 runs at 60 frames/second
- All additive attack-speed affixes combine into a single multiplier before the breakpoint lookup
- Each class and weapon type has its own attack animation with a different base frame count
- Breakpoints are discrete: going from 14 frames to 13 frames is a 7.7% DPS increase; a 3%
  attack speed increase straddling a breakpoint outperforms a 20% increase that doesn't cross one
- The Maxroll article contains per-class tables showing the attack-speed % required to reach each
  tier (e.g., Barbarian 2H: next breakpoint at +X% total attack speed)

**Season 13 gap:** Paladin and Warlock class breakpoints are not covered; the article predates their
release. Until a Season 13 update is published, breakpoints for these classes are unknown.

**ToS:** Read-only reference. Maxroll ToS prohibit scraping.

---

### 2.2 Datamine Verification

Attack-speed breakpoints are derived from the game's animation frame counts, which are in the
CASC animation data. The exact lookup process:

1. Each skill/Power definition references an animation file
2. The animation file specifies the frame count for the attack animation
3. Frame count + total attack-speed multiplier → actual APS

The animation data is in CASC archives under paths like `Animations/` and is binary (not plain JSON).
Extracting raw frame counts requires specialized tools beyond CascExplorer.

The Maxroll article's tables appear to be the product of empirical testing rather than direct
animation data extraction. No separate datamine-derived breakpoint dataset was found.

- provenance: `datamined` (animation data), `theorycraft` (Maxroll's breakpoint tables)
- verification: `unverified — see Open Items`

---

## 3. Cooldown Reduction (Diminishing Returns)

CDR applies a diminishing-returns formula above a soft cap. Community-documented formula:

**Position A (widely cited, pre-Season 13):**

```
Effective CDR = CDR_stat / (CDR_stat + 1.0)
```

This is a hyperbolic curve: 50% raw CDR → 33% effective CDR; 100% raw CDR → 50% effective CDR.

**Position B (some community sources):**
The diminishing-returns formula was adjusted at some point post-VoH; the hyperbolic curve may
have parameters different from the above.

⚠️ community-disputed — verify the current CDR formula from Season 13 patch notes at
`https://diablo4.blizzard.com/en-us/news/patch-notes` or Season 13 theorycraft.

**Sources:**
- Maxroll In-Depth Damage Guide (§2.1 of `05-damage.md`): covers CDR interaction with damage
  formulas as of Season 9
  - URL: `https://maxroll.gg/d4/resources/in-depth-damage-guide`
  - Accessed: 2026-05-07
  - Patch: Season 9 (June 29, 2025)
  - provenance: `theorycraft`
  - verification: `verified working`

**ToS:** Read-only reference. Maxroll ToS prohibit scraping.

- Blizzard patch notes: `https://diablo4.blizzard.com/en-us/news/patch-notes`
  - provenance: `official`
  - verification: `verified working`

**ToS (Blizzard patch notes):** Official Blizzard content; personal reference use is unrestricted.

---

## 4. Critical Strike Chance

Critical Strike Chance (CC) has a hard cap of 100%. Community positions on effective behavior:

**Position A:**
CC is a simple additive stat. At 100%, every hit crits. No diminishing returns; it is a hard cap
with uniform behavior below it.

**Position B (some Season 6–8 era theorycraft):**
Some early post-VoH discussions suggested an effective cap lower than 100% for certain skill
interactions or that CC had special interaction with Lucky Hit. Community consensus has largely
settled on Position A.

⚠️ community-disputed (minor) — standard understanding is a 100% hard cap with no diminishing
returns; verify from current Season 13 patch notes if optimization decisions hinge on CC values
near 100%.

- provenance: `theorycraft`
- Sources: Community Reddit (r/Diablo4Builds) — not individually cited due to thread impermanence.

**ToS (community sources):** Reddit content is public; not scraped programmatically. Personal
reference use only.

---

## 5. Movement Speed Cap

Movement speed has a documented soft cap:

**Widely cited position:** Total movement speed bonuses are additive up to a cap. The cap is
**+200% total movement speed from non-base sources**, giving an effective maximum of 3× base
movement speed.

**Verification status:** The Season 13 cap should be confirmed from patch notes. Lord of Hatred
expansion may have introduced new movement mechanics (War Plans system has movement components).

- provenance: `theorycraft`
- verification: `unverified — see Open Items`

---

## 6. Resistance and Armor (Diminishing Returns)

Armor provides physical damage reduction via a formula; resistances reduce elemental damage.

**Observed community formula for Armor (pre-Season 13):**

```
Damage Reduction = Armor / (Armor + 0.5 × Monster Level × 85)
```

where Monster Level scales with Paragon / World Tier / content difficulty.

- provenance: `theorycraft`
- Source: Community references including r/Diablo4Builds and various build guides. No single
  authoritative post was found during research.
- verification: `unverified — see Open Items`

**ToS (community sources):** Community formula; no single source to attribute. Reddit and
build-guide content is public; not scraped programmatically.

Resistances (Fire, Cold, Lightning, Poison, Shadow) each cap at 70% in base content and can
exceed 70% via resistance-cap-increasing affixes in endgame content.

---

## 7. Other Stats with Caps or DR

| Stat | Type | Cap / DR Note |
|------|------|---------------|
| Dodge Chance | Hard cap | 40% (Rogue) / varies by class; verify |
| Life on Kill / Life per Second | Soft — diminishing | No formal DR documented; see Open Items |
| Lucky Hit Chance | Additive; no DR | Affects proc rates for conditional effects |
| Resource Cost Reduction | Diminishing returns | Similar hyperbolic curve as CDR; formula unverified |
| Damage Reduction | Multiplicative stacking | Each DR source is multiplicative, not additive |

- provenance: `theorycraft`
- Sources: Community guides; individual entries unverified for Season 13.

---

## Open Items

- Obtain Season 13 / Paladin / Warlock attack-speed breakpoint tables — the Maxroll article
  predates their release (last updated Season 11). Check for an updated article or community
  posts on r/Diablo4Builds.
- Verify the CDR diminishing-returns formula for Season 13 (Position A vs Position B dispute in §3).
- Confirm the Movement Speed cap for Season 13 — check whether Lord of Hatred's War Plans system
  affects movement speed caps.
- Verify the Armor DR formula for Season 13 / Lord of Hatred difficulty scaling.
- Confirm Dodge Chance caps for all 10 classes including Paladin and Warlock.
- Investigate whether any datamine-based tool exists for programmatic breakpoint calculation
  (extracting animation frame counts from CASC binary data).
- Search for Season 13 theorycraft posts from Wudijo or Northwar specifically on breakpoints —
  no standalone breakpoint document found during research beyond the Maxroll article.
- Determine whether Resource Cost Reduction shares the same DR curve as CDR or has a different formula.
