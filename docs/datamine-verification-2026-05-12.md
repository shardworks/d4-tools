# Datamine Verification Audit — 2026-05-12

```
Source: DiabloTools/d4data
Build:  3.0.1.71747 (Season 13 / Lord of Hatred)
Accessed: 2026-05-12
```

This document is the authoritative audit trail for the catalog hygiene sweep performed on
2026-05-12. It covers two passes:

1. **Implicit-label canonicalization** — six `affix_implicit_*` entries carried
   parenthesized labels (e.g. `"Implicit Armor (Helm)"`) that scored below
   `FUZZY_THRESHOLD = 0.82` against bare in-game tooltip text. All six are updated to
   bare canonical labels derived from the `labelTemplate` field.

2. **Same-attribute duplicate reconciliation** — ten affix families contained a generic
   entry (broad slot list) alongside one or more slot-specific entries sharing the same
   `attribute.eAttribute`. Under the position-aware resolver (v18), having duplicate
   candidates with the same normalized label produces ambiguous explicit-position
   resolutions. The slot-specific entries are dropped; the generic survives.

All family analysis is grounded in the catalog at build `3.0.1.71747` as present in
`lib/catalog/affixes.json` after the v17 comprehensive coverage pass.

---

## 1. Implicit-Label Canonicalization

### Method

For each `isImplicit: true` entry, the canonical label is derived by stripping the
value-interpolation token from `labelTemplate` (e.g. `+{value}% Barrier Generation` →
`Barrier Generation`). D12 overrides apply where `label` and `labelTemplate` disagreed
(weapon-damage entry).

### Results

| Catalog id | Old label | New canonical label | Source |
|---|---|---|---|
| `affix_implicit_armor_helm` | `Implicit Armor (Helm)` | `Armor` | D1 (strip token) |
| `affix_implicit_barrier_offhand` | `Implicit Barrier (Off-Hand)` | `Barrier Generation` | D1 (strip token) |
| `affix_implicit_crit_chance_amulet` | `Implicit Critical Strike Chance (Amulet)` | `Critical Strike Chance` | D1 (strip token) |
| `affix_implicit_weapon_damage` | `Implicit Weapon Damage` | `Core Skill Damage` | D1 + D12 (trust labelTemplate + attribute) |
| `affix_implicit_damage_reduction_chest` | `Implicit Damage Reduction (Chest)` | `Damage Reduction` | D1 (strip token) |
| `affix_implicit_lucky_hit_ring` | `Implicit Lucky Hit (Ring)` | `Lucky Hit Chance` | D1 + D13 (align with sibling explicit family) |

**D12 note (`affix_implicit_weapon_damage`):** The old label `"Implicit Weapon Damage"`
contradicts both the `labelTemplate` (`+{value}% Core Skill Damage`) and the
`attribute.eAttribute` (`Attr_Core_Skill_Damage_Percent`). The canonical label is
`"Core Skill Damage"` (trust template + attribute). The catalog id
`affix_implicit_weapon_damage` is intentionally preserved to avoid renaming churn.

**D13 note (`affix_implicit_lucky_hit_ring`):** The old label `"Implicit Lucky Hit (Ring)"`
omitted "Chance". The sibling explicit family (`affix_lucky_hit_chance`,
`affix_lucky_hit_ring` before the latter was dropped) consistently uses "Lucky Hit Chance".

---

## 2. Same-Attribute Duplicate Reconciliation

### Method

For each family where two or more catalog entries share the same `attribute.eAttribute`,
the slot lists are compared. When the generic's slot list is a superset of (or equal to)
the specific's slot list, the specific entry is dropped. The generic's `valueRanges` and
`slotRestrictions` are preserved without modification.

Two explicit exception classes are documented below (§2b) and left untouched.

### 2a. Reconciled families (drop-specific decision)

---

#### Family 1 — Armor (`Attr_Armor_Item`)

| Entry | Slots | Value range (min–max, IP 0) | Decision |
|---|---|---|---|
| `affix_armor` (**surviving**) | helm, chest, gloves, pants, boots, amulet | IP-banded: 50–75 @ IP1 / 183–274 @ IP200 / 300–450 @ IP300 / 600–900 @ IP700 | **keep** |
| `affix_helm_armor` (dropped) | helm | 400–2000 | drop — slot subset of generic |
| `affix_chest_armor` (dropped) | chest | 600–3000 | drop — slot subset of generic |

**Surviving `affix_armor` slot list:** helm, chest, gloves, pants, boots, amulet
**Surviving `affix_armor` valueRanges:**
```json
[
  { "minItemPower": 1,   "min": 50,  "max": 75  },
  { "minItemPower": 200, "min": 183, "max": 274 },
  { "minItemPower": 300, "min": 300, "max": 450 },
  { "minItemPower": 700, "min": 600, "max": 900 }
]
```

---

#### Family 2 — Attack Speed (`Attr_Attacks_Per_Second_Percent_Bonus`)

| Entry | Slots | Value range (min–max) | Decision |
|---|---|---|---|
| `affix_attack_speed` (**surviving**) | gloves, amulet, ring1, ring2 | 5–10.5% | **keep** |
| `affix_gloves_attack_speed` (dropped) | gloves | 3–8% | drop — slot subset of generic |
| `affix_attack_speed_ring` (dropped) | ring1, ring2, amulet | 4–9% | drop — slot subset of generic |

**Note:** `affix_attack_speed_weapon` has `eAttribute: Attr_Attacks_Per_Second_Item_Percent`
(a different attribute — weapon attack-speed on-item), not `Attr_Attacks_Per_Second_Percent_Bonus`.
It is **not** in scope for this deduplication.

---

#### Family 3 — Critical Strike Damage (`Attr_Crit_Damage_Percent`)

| Entry | Slots | Value range (min–max) | Decision |
|---|---|---|---|
| `affix_crit_damage` (**surviving**) | gloves, amulet, ring1, ring2, weapon, offHand, barb_1h_main, barb_1h_off, barb_2h_bludgeoning, barb_2h_slashing | 20–50% | **keep** |
| `affix_gloves_crit_damage` (dropped) | gloves | 10–25% | drop — slot subset of generic |
| `affix_crit_damage_ring` (dropped) | ring1, ring2, amulet | 10–25% | drop — slot subset of generic |
| `affix_crit_damage_weapon` (dropped) | weapon, offHand, barb_* | 12–30% | drop — slot subset of generic |

---

#### Family 4 — Critical Strike Chance (`Attr_Crit_Strike_Chance_Percent`)

| Entry | Slots | Value range (min–max) | Decision |
|---|---|---|---|
| `affix_crit_chance` (**surviving**) | helm, gloves, amulet, ring1, ring2 | 3–7.5% | **keep** |
| `affix_gloves_crit_chance` (dropped) | gloves | 2–5.5% | drop — slot subset of generic |
| `affix_crit_chance_ring` (dropped) | ring1, ring2, amulet | 2–5% | drop — slot subset of generic |
| `affix_crit_chance_weapon` (dropped) | weapon, offHand, barb_* | 2–5% | drop — slot subset of generic |

---

#### Family 5 — Dodge Chance (`Attr_Dodge_Rating`)

| Entry | Slots | Value range (min–max) | Decision |
|---|---|---|---|
| `affix_dodge_chance` (**surviving**) | pants, boots | 4–9% | **keep** |
| `affix_pants_dodge` (dropped) | pants | 3–7% | drop — slot subset of generic |

---

#### Family 6 — Lucky Hit Chance (`Attr_Lucky_Hit_Chance_Percent`)

| Entry | Slots | Value range (min–max) | Decision |
|---|---|---|---|
| `affix_lucky_hit_chance` (**surviving**) | (all slots — empty restriction list) | 5–12% | **keep** |
| `affix_gloves_lucky_hit` (dropped) | gloves | 3–8% | drop — slot subset of generic (all ⊇ gloves) |
| `affix_lucky_hit_ring` (dropped) | ring1, ring2, amulet | 3–8% | drop — slot subset of generic |
| `affix_lucky_hit_weapon` (dropped) | weapon, offHand, barb_* | 3–8% | drop — slot subset of generic |

---

#### Family 7 — Movement Speed (`Attr_Movement_Speed_Bonus_Pct`)

| Entry | Slots | Value range (min–max) | Decision |
|---|---|---|---|
| `affix_movement_speed` (**surviving**) | boots, amulet | 8–18% | **keep** |
| `affix_boots_movement_speed` (dropped) | boots | 6–14% | drop — slot subset of generic |

---

#### Family 8 — Overpower Damage (`Attr_Overpower_Damage_Percent`)

| Entry | Slots | Value range (min–max) | Decision |
|---|---|---|---|
| `affix_overpower_damage` (**surviving**) | gloves, amulet, ring1, ring2, weapon, offHand, barb_* | 20–45% | **keep** |
| `affix_overpower_weapon` (dropped) | weapon, offHand, barb_* | 15–35% | drop — slot subset of generic |

---

#### Family 9 — Physical Damage (`Attr_Physical_Damage_Percent`)

| Entry | Slots | Value range (min–max) | Decision |
|---|---|---|---|
| `affix_physical_damage` (**surviving**) | (all slots — empty restriction list) | 10–25% | **keep** |
| `affix_physical_damage_weapon` (dropped) | weapon, offHand, barb_* | 8–20% | drop — slot subset of generic |

---

#### Family 10 — Companion Damage (`Attr_Companion_Skill_Damage_Percent`)

| Entry | Slots | Class restrictions | Value range (min–max) | Decision |
|---|---|---|---|---|
| `affix_druid_companion_damage` (**surviving**) | (all — empty) | Druid | 15–35% | **keep** |
| `affix_druid_companion_skill_damage` (dropped) | (all — empty) | Druid | 20–40% | drop — identical slot + class restriction set |

---

### 2b. Families left untouched (not reconciled)

The following same-attribute pairs were inspected but **not** reconciled because they do
not meet the "generic's slot list ⊇ specific's slot list" criterion.

| Attribute | Entry A | Entry B | Reason not reconciled |
|---|---|---|---|
| `Attr_Vuln_Damage_Percent` | `affix_vulnerable_damage` (ring1,ring2,amulet,gloves) | `affix_vulnerable_damage_weapon` (weapon,offHand,barb_*) | Non-overlapping slot lists; distinct stat expression on armor vs. weapon |
| `Attr_Armor_Item_Percent` | `affix_armor_pct` | — | Different attribute from `Attr_Armor_Item`; not a duplicate of `affix_armor` |
| `Attr_Attacks_Per_Second_Item_Percent` | `affix_attack_speed_weapon` | — | Different attribute from `Attr_Attacks_Per_Second_Percent_Bonus`; weapon-specific on-item stat |
| `Attr_Skill_Damage_Percent` | `affix_skill_damage_weapon`, `affix_damage_amulet` | — | No generic counterpart; slot-distinct expressions of the same stat class |

---

## 3. Summary

| Pass | Action | Entries affected |
|---|---|---|
| Implicit canonicalization | Label updated | 6 (`affix_implicit_*` entries) |
| Duplicate reconciliation | Dropped | 18 slot-specific entries |
| Not reconciled | Left untouched | 4 family-pairs (non-overlapping or distinct attribute) |

The `affix_all_res` (amulet implicit, already canonicalized in v18) is unchanged.

Seven `isImplicit: true` curation records were added to `tools/datamine-import/curation.json`
(bnetFileNames: `Resistance_Jewelry_All`, `zzSMP_WishingWell_Stat_Armor`,
`Barrier_Strength_Percent`, `CritChance`, `Damage`, `DamageReduction`, `LuckJewelry`) to
lock in the `isImplicit` flag and `manualValueRanges` across future datamine regenerations.
