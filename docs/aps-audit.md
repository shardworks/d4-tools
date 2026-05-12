# APS Audit — Season 13

**Status:** Initial hand-curation pass.
**Source:** In-game tooltips, Season 13 (Season of Reckoning), patch unconfirmed.
**Recorded:** 2026-05-07.

## baseApsByWeaponType

Values in `lib/catalog/game-math.json#baseApsByWeaponType` are base attacks-per-second
for each weapon type as read from in-game tooltips. Re-verify each season/patch by inspecting
the weapon tooltip's native APS value before any +Attack Speed affixes are applied.

| Weapon type     | Base APS | Speed class |
|-----------------|----------|-------------|
| 1HDagger        | 1.20     | VeryFast    |
| 1HFlail         | 1.20     | VeryFast    |
| 1HFocus         | 1.20     | VeryFast    |
| 1HWand          | 1.20     | VeryFast    |
| 1HAxe           | 1.10     | Fast        |
| 1HMace          | 1.10     | Fast        |
| 1HScythe        | 1.10     | Fast        |
| 1HSword         | 1.10     | Fast        |
| 1HTotem         | 1.10     | Fast        |
| 2HBow           | 1.00     | Fast        |
| 2HQuarterstaff  | 1.00     | Fast        |
| 2HGlaive        | 0.90     | Normal      |
| 2HStaff         | 0.90     | Normal      |
| 2HSword         | 0.85     | Normal      |
| 2HAxe           | 0.75     | Slow        |
| 2HCrossbow      | 0.85     | Slow        |
| 2HMace          | 0.75     | Slow        |
| 2HPolearm       | 0.80     | Slow        |
| 2HScythe        | 0.90     | Slow        |

## Innate speed note

The `arInnateStatList` field in each `ItemType/<WeaponType>.itt.json` carries a weapon-type
innate speed modifier. As of Season 13 all values are 0.0, meaning the game's observed base APS
already incorporates any innate speed bonus. A separate `innateSpeedByWeaponType` table was
originally planned but removed because it was structurally dead (all zeros, unread by the engine).

If a future patch adds nonzero innate modifiers, add a `(1 + innate) × (1 + rolledAS)` factor
inside `breakpoints.ts#computeEffectiveAps`. Re-verify by checking `tAttackSpeedModifier.fValue`
in the relevant `.itt.json` files each season.

## Speed class → weaponSpeedClass mapping

Speed class is stored as `weaponSpeedClass` on `AffixEntry` for weapon-damage implicit affixes:

- **VeryFast** — 1HDagger, 1HFlail, 1HFocus, 1HWand
- **Fast** — 1HAxe, 1HMace, 1HScythe, 1HSword, 1HTotem, 2HBow, 2HQuarterstaff
- **Normal** — 2HGlaive, 2HStaff, 2HSword
- **Slow** — 2HAxe, 2HCrossbow, 2HMace, 2HPolearm, 2HScythe

Speed class does not affect the damage engine directly; it is carried in the catalog for
future breakpoint table improvements (e.g. speed-class-grouped APS fallback).
The engine uses the weapon type string derived from the affix id for APS lookup.

## How weapon type is derived

`breakpoints.ts#deriveWeaponTypeFromItem()` parses the `affix_weapon_damage_<type>` implicit id:

```
affix_weapon_damage_1h_sword → "1H" + "Sword" → "1HSword"
affix_weapon_damage_2h_axe   → "2H" + "Axe"   → "2HAxe"
```

This string is used as the key into `baseApsByWeaponType` in game-math.json.

## Re-verification checklist

On each major patch or season update:

1. Equip one of each weapon type on a character with no +Attack Speed gear.
2. Record the APS value from the weapon tooltip.
3. Update `lib/catalog/game-math.json#baseApsByWeaponType` for any changed values.
4. Re-run `pnpm test` to ensure breakpoint tests remain consistent.
5. Update `verifiedAgainst.patch` in game-math.json.
