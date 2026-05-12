# lib/damage — Damage Engine

Pure-functional sustained boss DPS engine for D4 builds. Encodes D4's multiplicative-bucket
damage formula (v15 commission). No I/O, no global state — call it at render-time.

---

## Public API

### `computeBuildDps(build, character, catalog, config): BuildDpsResult`

Top-level entry point. Computes sustained boss DPS for every damaging skill selected in a build.

```typescript
import { computeBuildDps, loadDamageConfig } from "@/lib/damage";
import { getSkillsForClass, affixes, aspects, uniques } from "@/lib/catalog";

const config = loadDamageConfig(); // server-side only (uses fs)
const catalog = {
  skills: getSkillsForClass(character.class),
  affixes,
  aspects,
  uniques, // drives intrinsic-affix and intrinsic-aspect routing for equipped uniques
};
const result = computeBuildDps(build, character, catalog, config);
// result.aggregate — max per-skill DPS (the headline number)
// result.perSkill  — array of { skillId, skillLabel, rank, dps, ... }
```

**Client components:** Import `baseConfig` from `@/lib/damage/client-config` instead of
`loadDamageConfig()`. `baseConfig` is the bundled upstream baseline (no fs, safe in browsers).

### `isSkillDamaging(skill, config): boolean`

Returns `true` when the skill has at least one scaling attribute that maps to a damage bucket.
Used by UI components to filter the skill list.

### `loadDamageConfig(overridePathOverride?: string): DamageConfig`

Server-side only. Loads `lib/damage/config.json` and deep-merges
`data/damage-config.local.json` over it when that file exists. See [Config](#config) below.

---

## Damage Formula

```
Final DPS = weaponDamage × skillDamageCoeff × effectiveAPS × hitsPerCast
          × (1 + Σadditive + primaryStatBonus)
          × (1 + min(1, CSC) × (csBaseline + CSD))     ← crit EV
          × (1 + vulnUptime × (vulnBaseline + vulnBonus)) ← vuln EV
          × Π (1 + distinctMultiplierValue)
          × enemyDefenseMultiplier
```

Where:
- **weaponDamage** = arithmetic mean of all damage-contributing weapon slots. Each slot in
  `config.weaponSlotsByClass[className]` is checked: a slot contributes iff its item carries at
  least one implicit whose `affixId` starts with `"affix_weapon_damage_"` (D3 detection rule).
  Per-weapon value: reads `AffixInstance.rolledRange` → `(min + max) / 2`. Fallback: when the
  implicit has no `rolledRange` (stale data with `rolledValue`), falls back to `100 + 1.5 × itemPower`
  and emits a one-time `console.warn` per item key. Slots without a weapon-damage implicit (shields,
  focuses without the affix, off-hands of non-dual-wield builds) are silently skipped. Single-weapon
  classes naturally collapse to a mean of one. APS always reads from the main-hand (first occupied
  slot by priority order, regardless of the D3 filter).
  The old `itemPowerFormula` config key has been removed (D10 patron override).
- **skillDamageCoeff** = `scaleValue + rankScale × (rank − 1)` (from Power file, D5)
- **effectiveAPS** = 60fps / framesPerAttack (breakpoint table lookup, D34).
  Per-weapon-type base APS is resolved from `lib/catalog/game-math.json#baseApsByWeaponType`
  using the weapon type string derived from the item's `affix_weapon_damage_<type>` implicit id
  (D14). Falls back to `config.baseWeaponAps` when no matching implicit is found.
- **CSC** = `critBaseChance + Σcrit_chance bucket` (hard-capped at 100%)
- **CSD** = `csBaseline + Σcrit_damage bucket`

**Unique intrinsic contributions:** When a unique or mythic item is equipped, the engine resolves
its `UniqueEntry` from the `catalog.uniques` array and contributes its `intrinsicAffixes` to the
additive bucket (and other buckets per `attributeToBucket`) at catalog-max value. `intrinsicAspects`
entries flagged `isDistinctMultiplier: true` (either via their referenced `AspectEntry` or directly)
are folded into the distinct-mult product. Label-only entries with no routing flag are silently skipped.

### Uptime model (boss-DPS framing, D15)

| Conditional | Boss uptime |
|-------------|-------------|
| `unconditional` | 1.0 |
| `elite` | 1.0 (boss is an elite) |
| `vulnerable` | 0.90 (configured) |
| `cc` | 0.0 (boss immune) |
| `distance-close` | 1.0 if class default is close; else 0.0 |
| `distance-distant` | 1.0 if class default is distant; else 0.0 |

### Aggregate

`aggregate = max(perSkill.map(s => s.dps))` — the single-skill headline number (D18).

---

## v1 Exclusions

| Feature | Decision |
|---------|----------|
| Overpower | D24: OP = 0 (requires Life+Fortify state not tracked) |
| Paragon/glyph contributions | D25: `paragonAllocation` ignored |
| Movement speed threshold | D31: no MS threshold modeling |
| Resource economy | D27: optimistic sustain assumed |
| AoE / multi-target | Out of scope — boss single-target only |
| hitsPerCast > 1 | Not modeled (v1 assumes 1 hit per cast) |

---

## Config

`lib/damage/config.json` is the upstream baseline. Override specific values by creating
`data/damage-config.local.json` (deep-merged at call time, arrays replaced wholesale).

Example override to flip Core Skill Damage to Position B:

```json
{
  "attributeToBucket": {
    "Attr_Core_Skill_Damage_Percent": {
      "bucket": "distinct_mult",
      "conditional": "unconditional",
      "source": "override-position-b"
    }
  }
}
```

Key config sections:

| Key | Purpose |
|-----|---------|
| `attributeToBucket` | Maps `eAttribute` strings → `{ bucket, conditional }`. Contains both `Attr_*`-style keys (used by the hand-curated aspects/uniques catalog and older test fixtures) and bare-form keys (used by the pipeline-generated affixes catalog). |
| `buckets` | Bucket type definitions (`additive`, `crit_chance`, `crit_damage`, `vulnerable`, `distinct_mult`, `attack_speed`, `stat`, `ignored`) |
| `constants` | `critBaseChance`, `csBaseline`, `vulnerableBaseline`, `enemyDefenseMultiplier` |
| `breakpoints` | Per-class per-weapon-type APS breakpoint tables |
| `uptimes` | Default uptime values (`vulnerable`, `cc`, `elite`) |
| `distanceDefault` | Per-class default combat distance (`close` or `distant`) |
| `classPrimaryStats` | Maps class → primary stat attribute name |
| `primaryStatScalar` | Converts primary-stat total to additive bonus (0.001 per point) |
| `itemPowerFormula` | `{ type: "linear", slopePerIlvl, baseAtIlvl0 }` |
| `weaponSlotsByClass` | Priority-ordered weapon slot IDs per class. The first occupied slot is the main-hand for APS. Composition reads every occupied slot whose item carries an `affix_weapon_damage_*` implicit. |
| `weaponTypeBySlot` | Maps slot ID → `"1h"` or `"2h"` for breakpoint table key |
| `baseWeaponAps` | Base weapon speed before any +AS% modifiers (default 1.0) |

---

## Module Layout

| File | Responsibility |
|------|----------------|
| `index.ts` | Public API (`computeBuildDps`, `isSkillDamaging`, `EngineCatalog` shape including `uniques`, re-exports) |
| `formula.ts` | Core DPS math (`computeBuildDpsFromParts`, `computeSkillDps`) |
| `buckets.ts` | Affix contribution collection and routing; `collectIntrinsicsFromUnique` collects unique intrinsic powers |
| `breakpoints.ts` | Attack speed quantization (`computeEffectiveAps`) |
| `conditionals.ts` | Uptime resolution (`resolveUptime`, `sumBucketWithUptime`) |
| `types.ts` | Result types (`BuildDpsResult`, `SkillDpsResult`, etc.) |
| `config.ts` | Config loader (`loadDamageConfig`, `DamageConfig` interface) |
| `config.json` | Upstream baseline theorycraft config |
| `client-config.ts` | Browser-safe `baseConfig` constant (no fs import) |

---

## Error Handling

### `Attr_*` keys vs bare-form keys

`config.json` contains two naming conventions for `attributeToBucket` keys:

- **`Attr_*` style** (e.g. `Attr_Skill_Damage_Percent`) — Used by the hand-curated aspects and
  uniques catalogs (`lib/catalog/aspects.json`, `lib/catalog/uniques.json`) and by test fixtures.
  37 `Attr_*` keys are retained; 73 that were unreferenced by any catalog, production code, or test
  were pruned in the v19 live-catalog migration.
- **Bare-form** (e.g. `Crit_Damage_Percent`, `Attack_Speed_Percent_Bonus`) — Used by the
  pipeline-generated affixes catalog (`lib/catalog/affixes.json`), which emits the raw d4data
  `__eAttribute_name__` values without the Hungarian `Attr_` prefix.

Do not audit or remove bare-form keys from this file — they are owned by the import pipeline and
are stable across patch updates.

---

**Unmapped attribute (D30):** When an equipped item carries an affix whose `attribute.eAttribute`
is not present in `attributeToBucket`, the engine throws:

```
[damage/buckets] Equipped affix <affixId> references attribute <eAttr> which is not mapped
in attributeToBucket. Add a mapping or mark the attribute as "ignored".
```

This is fail-loud by design — unknown attributes in equipped gear indicate a config gap.
Add the attribute to `attributeToBucket` with bucket `"ignored"` to suppress the throw.

---

## Tests

`__tests__/damage-engine.test.ts` — 330+ tests covering bucket aggregation, breakpoint behavior,
uptime model, Position A/B config switching, fail-loud on unmapped attribute, Paladin/Warlock
linear AS, and more.

`__tests__/build-summary-render.test.ts` — Tests for `computeBuildDps` with `baseConfig`
(the code path used by `BuildSummaryView`).

`__tests__/triage-dps-delta.test.ts` — Tests for the DPS delta computation (the code path
used by `DpsDeltaSection` in the triage pane).
