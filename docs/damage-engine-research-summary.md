# Damage Engine — Research Summary

> **Generated:** 2026-05-09
> **Commission:** v15 — Damage Formula Engine (Sustained Boss DPS) with Per-Skill DPS in Build + Triage UI
> **Status:** v1 implementation complete.

This document summarizes the research used to build the v1 damage engine, the decisions made
(with rationale), and the open questions deferred to future iterations.

---

## 1. Primary Sources

### 1.1 Maxroll — In-Depth Damage Guide (Season 9)

URL: `https://maxroll.gg/d4/resources/in-depth-damage-guide`
Accessed: 2026-05-07. Patch: Season 9 (June 29, 2025) — not updated for Season 13.

This is the canonical baseline for the v1 engine. Key claims adopted:
- Damage is a product of multiplicative buckets
- `+% Core Skill Damage` and `+% [Skill Name] Damage` stack additively in the same bucket
  (Position A — adopted as default, overridable via config)
- Vulnerable Damage: 20% baseline multiplier, increased by `+% Vulnerable Damage` affixes
- Critical Strike Damage: 50% baseline, scaled by `+% Critical Strike Damage`
- Overpower: a separate damage event, not a bucket multiplier (excluded from v1 per D24)

### 1.2 Maxroll — Attack Speed Mechanics (Season 11)

URL: `https://maxroll.gg/d4/resources/attack-speed-mechanics`
Accessed: 2026-05-07. Patch: Season 11 (January 7, 2026) — not updated for Season 13/Paladin/Warlock.

Source for breakpoint tables. Key claims adopted:
- D4 runs at 60 fps; attacks animate over discrete frame counts
- All additive +AS% affixes combine into a single multiplier before breakpoint lookup
- Effective APS = 60 / framesPerAttack (quantized to the active tier)
- Per-class, per-weapon-type breakpoint tables in `lib/damage/config.json`

### 1.3 DiabloTools/d4data (Season 13, patch 3.0.1.71747)

URL: `https://github.com/DiabloTools/d4data`
Accessed: 2026-05-07.

Source for:
- Skill Power files (`Power/`) — `arScalingAttributes` with `eAttribute`, `fScaleValue`, `nRankScale`
- Attribute type definitions (bucket routing)
- Item affix attribute references (`tAttribute.eAttribute` and `nParam`)

---

## 2. Key Decisions

### 2.1 Position A vs. Position B (D9)

**Question:** Does `Attr_Core_Skill_Damage_Percent` go in the additive bucket or a distinct
multiplicative bucket?

**Decision:** Position A (additive) is the default, encoded in `config.json`. Community dispute
exists; Position B can be activated without touching engine code via the local override:

```json
{
  "attributeToBucket": {
    "Attr_Core_Skill_Damage_Percent": {
      "bucket": "distinct_mult",
      "conditional": "unconditional"
    }
  }
}
```

**Rationale:** Maxroll Season 9 (the most authoritative single source) states Position A. The
override mechanism exists precisely so this can be changed as Season 13 theorycraft matures.

### 2.2 Vulnerable Damage Baseline (D10, D13)

**Decision:** `vulnerableBaseline = 0.20` (×1.20 on Vulnerable enemies), `vulnUptime = 0.90`.

**Rationale:** Season 9 baseline from Maxroll. Not confirmed for Season 13 (see open items).
The config makes this trivially overridable when Season 13 verification completes.

### 2.3 Paladin and Warlock — Linear AS (D34)

**Decision:** Paladin and Warlock use linear APS (no frame quantization).

**Rationale:** Maxroll Attack Speed Mechanics was last updated Season 11 — before Paladin and
Warlock existed. No Season 13 breakpoint tables are available for these classes. Rather than
fabricating tables, the engine uses raw APS for these two classes. This is conservative and
correct: breakpoint tables can be added to config when published.

### 2.4 Item Power → Weapon Damage (D26)

**Decision:** `weaponDamage = 100 + 1.5 × itemPower` (linear model).

**Rationale:** v1 approximation. The real D4 weapon damage formula involves gear tiers and
power thresholds, not a pure linear function. This is a placeholder pending proper datamined
weapon base damage per item power bracket. The formula type and parameters are in config.json
and can be updated without engine code changes.

### 2.5 hitsPerCast = 1 (D22)

**Decision:** All skills are modeled as 1 hit per cast.

**Rationale:** Multi-hit skills (e.g. Fireball with Wizard's Fireball upgrade hitting 3 targets,
Tornado with multiple ticks) require per-skill hit-count tables from Power file analysis. v1
defers this; the formula has a `hitsPerCast` multiplier that's always 1.0 in v1.

### 2.6 Fail-Loud on Unmapped Attribute (D30)

**Decision:** When an equipped affix's `attribute.eAttribute` is not in `attributeToBucket`,
the engine throws an error with the attribute name.

**Rationale:** Silently ignoring unknown attributes would mask config gaps. Fail-loud surfaces
missing entries immediately. Use bucket `"ignored"` in config to explicitly suppress non-damage
attributes.

### 2.7 Aggregate = Max (D18)

**Decision:** `aggregate = Math.max(...perSkill.map(s => s.dps))`.

**Rationale:** The aggregate represents the "peak DPS skill." Summing would overstate single-skill
DPS and mix target contexts incorrectly (each skill is evaluated as if it were the only attacking
skill). The UI shows per-skill breakdown separately to convey the full picture.

---

## 3. Attribute → Bucket Mapping (config.json)

The `attributeToBucket` table in `lib/damage/config.json` maps ~50 datamine attribute names to
engine buckets and conditionals. Key entries:

| Attribute | Bucket | Conditional |
|-----------|--------|-------------|
| `Attr_Skill_Damage_Percent` | `additive` | `unconditional` |
| `Attr_Core_Skill_Damage_Percent` | `additive` | `unconditional` (Position A) |
| `Attr_Crit_Percent_Bonus` | `crit_chance` | `unconditional` |
| `Attr_Crit_Damage_Percent` | `crit_damage` | `unconditional` |
| `Attr_Vuln_Damage_Percent` | `vulnerable` | `vulnerable` |
| `Attr_Damage_Percent_Bonus_With_Crowd_Control` | `additive` | `cc` |
| `Attr_Attack_Speed_Percent` | `attack_speed` | `unconditional` |
| `Attr_Strength` | `stat` | `unconditional` |
| `Attr_Dexterity` | `stat` | `unconditional` |
| `Attr_Intelligence` | `stat` | `unconditional` |
| `Attr_Willpower` | `stat` | `unconditional` |
| `Attr_Max_Life` | `ignored` | `unconditional` |

Entries with `bucket: "ignored"` do not contribute to DPS but prevent fail-loud throws.

---

## 4. Open Items

The following items were deferred from v1 and should be revisited in future commissions:

1. **Season 13 Vulnerable Damage baseline** — the Season 9 value (×1.20) may have been adjusted.
   Monitor Season 13 patch notes and theorycraft guides.

2. **Paladin and Warlock breakpoint tables** — no published tables exist (Season 11 Maxroll guide
   predates these classes). Check Maxroll for Season 13 updates.

3. **Real weapon damage formula (D26)** — the linear `100 + 1.5×IP` placeholder needs replacement
   with the actual per-tier damage tables from the datamine.

4. **hitsPerCast > 1 (D22)** — multi-hit skills require per-skill hit count tables extracted
   from Power file analysis.

5. **Core Skill Damage bucket dispute (Position A/B)** — monitor Season 13 theorycraft for
   resolution. The override mechanism is ready.

6. **Overpower modeling (D24)** — deferred; requires Life + Fortify state tracking.

7. **Paragon/glyph contributions (D25)** — deferred; requires paragon node attribute routing.

8. **Resource economy (D27)** — optimistic sustain assumed; no resource-drain modeling.

9. **AoE / multi-target / non-boss content** — out of scope for v1.

---

## 5. Implementation Reference

| Package | Path |
|---------|------|
| Damage engine | `lib/damage/` |
| Engine README | `lib/damage/README.md` |
| Theorycraft config | `lib/damage/config.json` |
| Build detail DPS chip | `components/d4/BuildSummaryView.tsx` |
| Per-skill DPS section | `components/d4/SkillDpsSection.tsx` |
| Triage DPS delta | `components/triage/DpsDeltaSection.tsx` |
| Engine tests | `__tests__/damage-engine.test.ts` |
| Config tests | `__tests__/damage-config.test.ts` |
| Build surface tests | `__tests__/build-summary-render.test.ts` |
| Triage delta tests | `__tests__/triage-dps-delta.test.ts` |
