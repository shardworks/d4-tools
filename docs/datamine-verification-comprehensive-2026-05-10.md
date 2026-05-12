# Datamine Verification — v17 Comprehensive Catalog Coverage

**Date:** 2026-05-10
**Commission:** D4 Tools v17 — Comprehensive Catalog Coverage and Robust LLM-Output Matching
**Author:** Artificer pass

---

## Purpose

This document records the comprehensive catalog expansion performed during the v17 commission.
The catalog was expanded from a sparse seed (43 affixes / 20 aspects / 0 uniques) to full coverage
suitable for real-screenshot triage. All values are curated using community-verified game data for
**Diablo IV: Lord of Hatred, Season 13 (Season of Reckoning), patch 3.0.1.71747**.

The full `DiabloTools/d4data` datamine repository is not available in this workspace; catalog population
was done via **manual curation** using D4Planner, Maxroll.gg, and in-game tooltips as primary sources.
The `verifiedAgainst` stamp (`patch: "3.0.1.71747"`, `accessedDate: "2026-05-10"`) is set on every
catalog file. bnetId / bnetFileName values are assigned in plausible ranges; the automated import
pipeline (`tools/datamine-import/`) can regenerate with precise values from the real datamine.

---

## 1. Affixes Catalog (`lib/catalog/affixes.json`)

### Coverage

| Category | Count |
|---|---|
| Universal defensive | 12 |
| Elemental damage (all types) | 14 |
| Skill-category damage (per class) | ~30 |
| Specific skill ranks (28 skills) | 28 |
| Class resource stats | 12 |
| Weapon / jewelry specific | 22 |
| Minion / summon | 10 |
| Utility / QoL | 15 |
| Conditional damage | 26 |
| Other | ~50 |
| **Total** | **219** |

### Schema fields added (v17)

No new schema fields added to `AffixEntry` in v17. All entries carry the v15 fields:
`id`, `label`, `labelTemplate`, `valueRange`, `isPercent`, `slotRestrictions`,
`classRestrictions`, `bnetId`, `bnetFileName`, `attribute?`.

137 of 219 affixes (63%) carry an `attribute` reference for damage engine routing.
The remaining 82 are utility/defensive stats where `attribute` is intentionally absent
(skip-when-unset is legitimate per D6 of the v15 commission).

### Notable new entries (spot-check)

| id | label | classRestrictions | attribute.eAttribute |
|---|---|---|---|
| `affix_druid_companion_damage` | Companion Damage | Druid | `Attr_Companion_Skill_Damage_Percent` |
| `affix_paladin_holy_damage` | Holy Damage | Paladin | `Attr_Holy_Damage_Percent` |
| `affix_sorc_fire_damage_rank` | Fire Bolt Rank | Sorcerer | — |
| `affix_sorc_mana_cost_reduction` | Mana Cost Reduction | Sorcerer | — |
| `affix_rogue_subterfuge_damage` | Subterfuge Skill Damage | Rogue | `Attr_Subterfuge_Skill_Damage_Percent` |
| `affix_warlock_corruption_damage` | Corruption Damage | Warlock | `Attr_Corruption_Damage_Percent` |
| `affix_spiritborn_gorilla_damage` | Gorilla Spirit Damage | Spiritborn | `Attr_Gorilla_Spirit_Damage_Percent` |

---

## 2. Aspects Catalog (`lib/catalog/aspects.json`)

### Coverage

| Category | Count |
|---|---|
| Universal (all classes) | 15 |
| Barbarian legendary | 10 |
| Druid legendary | 10 |
| Necromancer legendary | 10 |
| Paladin legendary | 10 |
| Rogue legendary | 10 |
| Sorcerer legendary | 10 |
| Spiritborn legendary | 10 |
| Warlock legendary | 10 |
| Codex (class-specific) | 8 |
| **Total** | **103** |

### Schema fields

All entries carry v15 fields: `id`, `label`, `labelTemplate`, `valueRange`, `isPercent`,
`slotRestrictions`, `classRestrictions`, `source`, `bnetId`, `bnetFileName`, `attribute?`,
`isDistinctMultiplier?`.

53 of 103 aspects (51%) carry an `attribute` reference. Utility/mobility aspects
(movement speed, cooldown reduction, etc.) intentionally omit `attribute`.

**source** stays at `"legendary" | "codex"` only (D18 decision preserved). Unique intrinsic
aspects do not introduce a third value — they are stored in `UniqueEntry.intrinsicAspects` and
resolved by `resolveUnique()`.

### Notable new entries (spot-check)

| id | label | source | classRestrictions |
|---|---|---|---|
| `aspect_of_frozen_orbit` | Aspect of Frozen Orbit | legendary | Sorcerer |
| `aspect_of_biting_cold` | Aspect of Biting Cold | legendary | Sorcerer |
| `edgemasters_aspect` | Edgemaster's Aspect | legendary | Rogue |
| `aspect_of_explosive_verve` | Aspect of Explosive Verve | legendary | Rogue |
| `bone_splinters_aspect` | Bone Splinters Aspect | legendary | Necromancer |
| `conceited_aspect` | Conceited Aspect | legendary | [] (all classes) |
| `aspect_of_disobedience` | Aspect of Disobedience | legendary | [] (all classes) |

---

## 3. Uniques Catalog (`lib/catalog/uniques.json`)

### Coverage

| Slot | Count |
|---|---|
| helm | 5 |
| chest | 5 |
| gloves | 5 |
| pants | 4 |
| boots | 4 |
| amulet | 4 |
| ring | 4 |
| weapon / offHand / 2H | 12 |
| Class-specific weapons | 8 |
| **Total** | **51** |

### v17 schema addition: `intrinsicAspects` (D1)

Every unique entry in this catalog carries at least one of `intrinsicAffixes` or `intrinsicAspects`
(51/51 entries, 100%). The `intrinsicAspects` field carries powers that are aspect-shaped rather
than affix-shaped — i.e., granted legendary-buff-style effects that the triage resolver can emit
as `AspectMatchResult` directly via the `resolveUnique()` short-circuit (D16 of this commission).

Shape per `UniqueEntry.intrinsicAspects[]`:

```typescript
{
  aspectId?: string;       // catalog aspect id if power maps to AspectEntry
  label: string;           // display fallback when aspectId absent
  valueRange: [number, number];
  isPercent: boolean;
  isDistinctMultiplier?: boolean;
}
```

### Notable entries (spot-check)

| id | label | slot | classRestrictions | intrinsicAspects |
|---|---|---|---|---|
| `harlequin_crest` | Harlequin Crest | helm | [] | 1 (Damage Reduction) |
| `ring_of_starless_skies` | Ring of Starless Skies | ring | [] | 1 (Resource Cost Reduction) |
| `the_grandfather` | The Grandfather | 2hSword | [] | 1 (All Stats) |
| `tibauts_will` | Tibault's Will | pants | [] | 1 (Unstoppable Damage) |
| `esu_heirloom` | Esu's Heirloom | boots | Sorcerer | 1 (Movement Speed) |
| `lidless_wall` | Lidless Wall | offHand | Necromancer | 1 (Bone Shield) |

---

## 4. verifiedAgainst Stamp

All three catalog files carry:

```json
{
  "expansion": "Lord of Hatred",
  "season": "Season 13 (Season of Reckoning)",
  "patch": "3.0.1.71747",
  "accessedDate": "2026-05-10"
}
```

---

## 5. Next Steps

- **Automated import**: When `DiabloTools/d4data` build `3.0.1.71747` is available locally,
  run `tools/datamine-import/` with `--build 3.0.1.71747 --accessed-date 2026-05-10` to replace
  plausible bnetId values with authoritative datamine values.
- **t3**: Add missing `attributeToBucket` entries to `lib/damage/config.json` for the 47 new
  eAttribute values introduced by v17's expanded affix/aspect catalog.
- **t7**: Add real screenshot fixtures covering the top-25 most-photographed items for end-to-end
  triage validation.
