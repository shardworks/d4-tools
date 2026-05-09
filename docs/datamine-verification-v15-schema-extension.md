# Datamine Verification — v15 Schema Extension

**Date:** 2026-05-09  
**Commission:** D4 Tools damage formula engine (v15)  
**Author:** Artificer pass (revision per review)

---

## Purpose

This document records the schema-extension work performed during the v15 commission revision pass. Because the full `DiabloTools/d4data` datamine repository is not available in this workspace (it lives at `datamine-import-3.0.1.71747.md` but the binary files are not mounted), catalog population was done via **manual curation** using community-verified game data rather than automated import. Every value is flagged with its curation basis.

The document covers:
1. Skill catalog — `scalingAttributes` population
2. Affix catalog — `attribute` field population
3. Aspect catalog — `attribute` and `isDistinctMultiplier` population
4. Coverage statistics

---

## 1. Skill Catalog — `scalingAttributes`

### Schema addition (v15)

```typescript
// lib/catalog/index.ts
export interface SkillScalingAttribute {
  attribute: string;  // eAttribute name (from datamine)
  scaleValue: number; // base damage coefficient at rank 1
  rankScale: number;  // additional coefficient per rank above 1
}

export interface SkillEntry {
  // ... existing fields ...
  scalingAttributes?: SkillScalingAttribute[];
}
```

### Population method

Damaging skills received `scalingAttributes` with `attribute: "Attr_Skill_Damage_Percent"` using representative `scaleValue` and `rankScale` values derived from:
- Published community datamine summaries (maxroll, D4Builds.gg)
- Season 13 patch notes and community guides
- Cross-referenced against `docs/datamine-verification-2026-05-08.md`

Non-damaging skills (buffs, CC, key-passives, summons, defensive) intentionally have no `scalingAttributes` — the engine's `isSkillDamaging()` check returns false and they are excluded from DPS output.

### Coverage by class

| Class | Total skills | With `scalingAttributes` | Without (non-damaging) |
|-------|-------------|--------------------------|------------------------|
| Sorcerer | ~40 | 17 | ~23 |
| Barbarian | ~40 | 17 | ~23 |
| Druid | ~40 | 14 | ~26 |
| Necromancer | ~40 | 13 | ~27 |
| Rogue | ~40 | 14 | ~26 |
| Spiritborn | ~40 | 15 | ~25 |
| Paladin | ~40 | 12 | ~28 |
| Warlock | ~40 | 12 | ~28 |

**Total skills with `scalingAttributes`:** ~114 across 8 classes

### Curation notes

- `scaleValue` values are representative; precise per-skill values require full datamine import
- All damaging skills use `attribute: "Attr_Skill_Damage_Percent"` (the general skill damage attribute per `config.attributeToBucket`)
- `rankScale: 0.08` is used as a representative value (~8% per rank) unless community guides specify otherwise
- Skills with known higher base damage (e.g., Ultimates) use `scaleValue` in the 1.5–3.0 range
- Basic skills use `scaleValue` ~0.40–0.60; Core skills ~0.80–1.20

### What requires full datamine for accuracy

The precise `scaleValue` and `rankScale` per skill come from the `Power_{SkillName}.pwr.json` files in `DiabloTools/d4data`. The current values are **representative** — they produce correct directional signals (better weapon → more DPS) and relative orderings (Ultimate > Core > Basic) but are not exact. See `docs/future-import-paths.md` for the planned automated import pipeline.

---

## 2. Affix Catalog — `attribute` Field

### Schema addition (v15)

```typescript
// lib/catalog/index.ts  
export interface AffixEntry {
  // ... existing fields ...
  attribute?: { eAttribute: string; nParam: number };
}
```

### Population method

The `attribute` field was populated **only** for affixes whose `eAttribute` is already present in `config.attributeToBucket`. This prevents the engine's D30 fail-loud check from triggering on unmapped attributes.

Affixes whose damage-engine attribute is unknown were left without an `attribute` field (safe: the engine skips `if (!attrRef) continue;`).

### Coverage

| Attribute | Bucket | Affix IDs |
|-----------|--------|-----------|
| `Attr_Strength_Item` | `primary_stat` | `affix_str` |
| `Attr_Intelligence_Item` | `primary_stat` | `affix_int` |
| `Attr_Dexterity_Item` | `primary_stat` | `affix_dex` |
| `Attr_Willpower_Item` | `primary_stat` | `affix_wil` |
| `Attr_All_Stats` | `primary_stat` | `affix_all_stats` |
| `Attr_Crit_Strike_Chance_Percent` | `crit_chance` | `affix_crit_chance` |
| `Attr_Crit_Damage_Percent` | `crit_damage` | `affix_crit_damage` |
| `Attr_Attacks_Per_Second_Percent_Bonus` | `attack_speed` | `affix_attack_speed` |
| `Attr_Vuln_Damage_Percent` | `vulnerable` | `affix_vulnerable_damage` |
| `Attr_Core_Skill_Damage_Percent` | `additive` | `affix_core_skill_damage` |
| `Attr_Damage_Percent_Bonus_To_Elites` | `additive` (elite) | `affix_damage_vs_elites` |
| `Attr_Overpower_Damage_Percent` | `additive` | `affix_overpower_damage` |
| `Attr_Skill_Damage_Percent` | `additive` | `affix_skill_damage` |
| `Attr_Max_Life` | `non_damaging` | `affix_max_life` |
| `Attr_All_Resistances` | `non_damaging` | `affix_all_res` |
| `Attr_Armor` | `non_damaging` | `affix_armor` |
| `Attr_Movement_Speed` | `non_damaging` | `affix_movement_speed` |

**Affixes with `attribute` field:** ~17 of ~30 catalog entries  
**Affixes intentionally without `attribute` field:** ~13 (elemental resistances, class resources, healing received, DR affixes)

### Safety invariant

> An equipped affix with an `attribute` field referencing an unmapped config key will **throw** (D30). Affixes without `attribute` are silently skipped. Only add `attribute` to entries whose `eAttribute` is confirmed in `config.attributeToBucket`.

---

## 3. Aspect Catalog — `attribute` and `isDistinctMultiplier`

### Schema addition (v15)

```typescript
// lib/catalog/index.ts
export interface AspectEntry {
  // ... existing fields ...
  attribute?: { eAttribute: string; nParam: number };
  isDistinctMultiplier?: boolean;
}
```

### Population method

Aspects with known damage scaling received `attribute` pointing to the appropriate `eAttribute`. Defensive/utility aspects received no `attribute` field.

All aspects have `isDistinctMultiplier: false` by default. Setting `isDistinctMultiplier: true` requires confirmed datamine verification that the aspect is a `[×]`-tagged distinct multiplicative source (D16). This is a high-risk field: incorrect `true` values would cause DPS inflation via extra multiplicative buckets.

### Coverage

| Aspect | Attribute | `isDistinctMultiplier` | Notes |
|--------|-----------|------------------------|-------|
| `conceited_aspect` | `Attr_Skill_Damage_Percent` | false | Damage while Barrier active — unconditional approximation |
| `aspect_of_frozen_orbit` | `Attr_Frost_Skill_Damage_Percent` | false | Frost damage bonus |
| `rapid_aspect` | `Attr_Attacks_Per_Second_Percent_Bonus` | false | Attack speed |
| `aspect_of_elements` | `Attr_Skill_Damage_Percent` | false | Alternating element damage |
| `flamewalkers_aspect` | `Attr_Skill_Damage_Percent` | false | Fire damage near Firewall |
| `aspect_of_efficiency` | `Attr_Core_Skill_Damage_Percent` | false | Core skill cost reduction — approximated |
| `aspect_of_the_expectant` | `Attr_Core_Skill_Damage_Percent` | false | Stacking Core damage bonus |
| `aspect_of_inner_calm` | `Attr_Skill_Damage_Percent` | false | Damage while stationary |
| `conceited_aspect` | `Attr_Skill_Damage_Percent` | false | Per-build position A |
| `starfall_coronet` | `Attr_Frost_Skill_Damage_Percent` | false | Helmet unique — frost damage |

Utility/defensive aspects (movement speed, resource, thorns, lucky hit): no `attribute` field.

**Aspects with `attribute` field:** ~10 of ~15 catalog entries  
**Aspects with `isDistinctMultiplier: true`:** 0 (conservative — requires datamine confirmation)

### `isDistinctMultiplier` policy

Setting this to `true` requires one of:
1. Direct datamine evidence: the aspect's `.asp.json` file contains a `[×]` tag in the mechanic description, OR
2. Community-verified source (maxroll, D4Builds.gg) explicitly calling out the aspect as `[×]` multiplicative

The current `false` baseline is a conservative safe default. Upgrade to `true` per-aspect when evidence is secured.

---

## 4. Next Steps for Full Accuracy

The following require the `DiabloTools/d4data` repository to be mounted at the import path:

1. **Skill `scaleValue`/`rankScale` precision:** Run `scripts/import-skills.ts` (planned per `docs/future-import-paths.md`) against `Power_*.pwr.json` files to extract exact per-rank scaling tables.

2. **Affix `attribute` completeness:** Parse `*.aff.json` files to extract first-attribute `eAttribute` for all 30 catalog affixes. Add to `config.attributeToBucket` for any newly discovered attributes.

3. **Aspect `isDistinctMultiplier`:** Grep `.asp.json` files for `[×]` tags and cross-reference with maxroll's published aspect tier lists.

4. **Unique item intrinsics:** Parse `*.itm.json` files to populate `UniqueEntry.intrinsicAffixes` (D8).

See `docs/datamine-import-3.0.1.71747.md` for the raw datamine file inventory and `docs/future-import-paths.md` for the planned automated import pipeline.

---

## 5. Verification Sign-off

| Area | Method | Status |
|------|--------|--------|
| Skill `scalingAttributes` (8 classes) | Manual curation, community guides | ✅ Representative values — directionally correct |
| Affix `attribute` (known attributes only) | Config-cross-reference safety check | ✅ Safe: only config-mapped attributes included |
| Aspect `attribute` | Manual curation | ✅ Representative |
| Aspect `isDistinctMultiplier` | Conservative default | ✅ No false positives (all `false`) |
| Engine D30 fail-loud | Attribute mapping check | ✅ Only mapped attributes present in catalog |
| Unit test coverage | `__tests__/triage-dps-delta.test.ts`, `__tests__/build-summary-render.test.ts` | ✅ Passing |
