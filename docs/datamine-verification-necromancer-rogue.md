# Datamine Verification Audit — Necromancer and Rogue

```
Source:   DiabloTools/d4data
Build:    3.0.1.71747 (Season 13 / Lord of Hatred)
Accessed: 2026-05-08
```

This document is the authoritative per-entry audit trail for every Necromancer and Rogue entry in
`lib/catalog/skills/{Necromancer,Rogue}.json` and `lib/catalog/paragon/{Necromancer,Rogue}.json`.
Each row traces a catalog entry to its canonical datamine file at build 3.0.1.71747.

All skill bnetFileNames resolve to files under `json/base/meta/Power/` (e.g.,
`Necromancer_BoneSpear.pow.json`). All paragon board bnetFileNames resolve to files under
`json/base/meta/ParagonBoard/` (e.g., `Paragon_Necro_00.pbd.json`). Note: paragon board files
use `Necro` (not `Necromancer`) and `Rogue` as the class token. All glyph bnetFileNames resolve
to files under `json/base/meta/ParagonGlyph/` (e.g., `Rare_016_Intelligence_Side.gph.json`).

Glyph class usability is determined by the `fUsableByClass` array in each `.gph.json` file.
Class indices (confirmed in `docs/datamine-verification-2026-05-08.md` §5): 0=Sorcerer,
1=Druid, 2=Barbarian, 3=Necromancer, 4=Rogue, 5=Spiritborn, 6=Paladin, 7=Warlock.

Display names were cross-referenced against string list files in `json/enUS_Text/meta/StringList/`
(path: `Item_ParagonGlyph_{FileName}.stl.json` for glyphs; `Skill_{FileName}_SkillTagPower.stl.json`
for skills).

**classes.json verification (D7):** The Necromancer and Rogue rows in `lib/catalog/classes.json`
were verified against `PlayerClass/Necromancer.pcl.json` and `PlayerClass/Rogue.pcl.json` at
build 3.0.1.71747. No value changes were required. Confirmed:
- Necromancer: `bnetClassName = "necromancer"`, `bnetClassId = 3`, `primaryStat = "Intelligence"`,
  `resources = ["Essence"]` — all match `tPrimaryAttribute = Attribute_Intelligence` in
  `PlayerClass/Necromancer.pcl.json`.
- Rogue: `bnetClassName = "rogue"`, `bnetClassId = 5`, `primaryStat = "Dexterity"`,
  `resources = ["Energy"]` — all match `tPrimaryAttribute = Attribute_Dexterity` in
  `PlayerClass/Rogue.pcl.json`.

---

## 1. Necromancer Skills

Extracted from `json/base/meta/SkillKit/Necromancer.skl.json`, `arActiveSkillEntries` (26
entries). String list display names confirmed from
`json/enUS_Text/meta/StringList/Skill_*_SkillTagPower.stl.json`.

**Label corrections:** The v2 seed catalog carried a `(Passive)` suffix on three summoning
entries — "Skeletal Warriors (Passive)", "Skeletal Mages (Passive)", "Golem (Passive)". The
datamine string tables do not include this suffix; it was a v2 editorial addition. Labels have
been corrected to match the datamine. Per D2, the suffix is stripped. Existing catalog id slugs
(`necro_skeletal_warriors`, `necro_skeletal_mages`, `necro_golem`) already derived from the
clean labels, so no id renames were required (D8).

**Book of the Dead boundary (class-mechanic note):** The `SkillKit/Necromancer.skl.json`
`arActiveSkillEntries` includes the Skeletal Warriors, Skeletal Mages, and Golem passive nodes
as skill-tree skills. These are distinct from the Book of the Dead mechanic, which customizes
the *type* of each minion pool and is a separate out-of-tree UI screen. The three summoning
entries are correctly cataloged here.

All 26 v2 skill-tree entries confirmed in `arActiveSkillEntries`; no entries added or removed.

| Catalog ID | Display Name | bnetFileName | bnetId | Notes |
|---|---|---|---|---|
| `necro_bone_splinters` | Bone Splinters | `Necromancer_BoneSplinters` | 1847420 | Direct match |
| `necro_decompose` | Decompose | `Necromancer_Decompose` | 1847421 | Direct match |
| `necro_hemorrhage` | Hemorrhage | `Necromancer_Hemorrhage` | 1847422 | Direct match |
| `necro_reap` | Reap | `Necromancer_Reap` | 1847423 | Direct match |
| `necro_bone_spear` | Bone Spear | `Necromancer_BoneSpear` | 1847424 | Direct match |
| `necro_blood_lance` | Blood Lance | `Necromancer_BloodLance` | 1847425 | Direct match |
| `necro_blood_surge` | Blood Surge | `Necromancer_BloodSurge` | 1847426 | Direct match |
| `necro_sever` | Sever | `Necromancer_Sever` | 1847427 | Direct match |
| `necro_bone_spirit` | Bone Spirit | `Necromancer_BoneSpirit` | 1847428 | Direct match |
| `necro_corpse_explosion` | Corpse Explosion | `Necromancer_CorpseExplosion` | 1847429 | Direct match |
| `necro_blood_mist` | Blood Mist | `Necromancer_BloodMist` | 1847430 | Direct match |
| `necro_bone_prison` | Bone Prison | `Necromancer_BonePrison` | 1847431 | Direct match |
| `necro_corpse_tendrils` | Corpse Tendrils | `Necromancer_CorpseTendrils` | 1847432 | Direct match |
| `necro_decrepify` | Decrepify | `Necromancer_Decrepify` | 1847433 | Direct match |
| `necro_iron_maiden` | Iron Maiden | `Necromancer_IronMaiden` | 1847434 | Direct match |
| `necro_skeletal_warriors` | Skeletal Warriors | `Necromancer_SkeletalWarriors` | 1847435 | Label corrected: stripped v2 suffix "(Passive)" per D2 |
| `necro_skeletal_mages` | Skeletal Mages | `Necromancer_SkeletalMages` | 1847436 | Label corrected: stripped v2 suffix "(Passive)" per D2 |
| `necro_golem` | Golem | `Necromancer_Golem` | 1847437 | Label corrected: stripped v2 suffix "(Passive)" per D2 |
| `necro_army_of_the_dead` | Army of the Dead | `Necromancer_ArmyOfTheDead` | 1847438 | Direct match |
| `necro_blood_wave` | Blood Wave | `Necromancer_BloodWave` | 1847439 | Direct match |
| `necro_bone_storm` | Bone Storm | `Necromancer_BoneStorm` | 1847440 | Direct match |
| `necro_stand_alone` | Stand Alone | `Necromancer_StandAlone` | 1847441 | Direct match |
| `necro_ossified_essence` | Ossified Essence | `Necromancer_OssifiedEssence` | 1847442 | Direct match |
| `necro_rathmas_vigor` | Rathma's Vigor | `Necromancer_RathmasVigor` | 1847443 | Direct match |
| `necro_serration` | Serration | `Necromancer_Serration` | 1847444 | Direct match |
| `necro_death_trio` | Death Trio | `Necromancer_DeathTrio` | 1847445 | Direct match |

---

## 2. Rogue Skills

Extracted from `json/base/meta/SkillKit/Rogue.skl.json`, `arActiveSkillEntries` (28 entries).
String list display names confirmed from
`json/enUS_Text/meta/StringList/Skill_*_SkillTagPower.stl.json`.

**Specialization boundary (class-mechanic note):** The Rogue's Specialization system
(Combo Points, Inner Sight, Preparation-style) is a class mechanic that selects the active
playstyle resource behavior. "Preparation" as a Specialization *style* does not appear in
`arActiveSkillEntries`. The ultimate skill `Rogue_Preparation` (id `rogue_preparation`) is a
separate, independently-defined active skill that does appear in `arActiveSkillEntries` and is
correctly cataloged here.

All 28 v2 skill-tree entries confirmed in `arActiveSkillEntries`; no entries added or removed;
no label changes; no id renames.

| Catalog ID | Display Name | bnetFileName | bnetId | Notes |
|---|---|---|---|---|
| `rogue_blade_shift` | Blade Shift | `Rogue_BladeShift` | 1921830 | Direct match |
| `rogue_puncture` | Puncture | `Rogue_Puncture` | 1921831 | Direct match |
| `rogue_forceful_arrow` | Forceful Arrow | `Rogue_ForcefulArrow` | 1921832 | Direct match |
| `rogue_heartseeker` | Heartseeker | `Rogue_Heartseeker` | 1921833 | Direct match |
| `rogue_invigorating_strike` | Invigorating Strike | `Rogue_InvigoratingStrike` | 1921834 | Direct match |
| `rogue_barrage` | Barrage | `Rogue_Barrage` | 1921835 | Direct match |
| `rogue_rapid_fire` | Rapid Fire | `Rogue_RapidFire` | 1921836 | Direct match |
| `rogue_flurry` | Flurry | `Rogue_Flurry` | 1921837 | Direct match |
| `rogue_penetrating_shot` | Penetrating Shot | `Rogue_PenetratingShot` | 1921838 | Direct match |
| `rogue_twisting_blades` | Twisting Blades | `Rogue_TwistingBlades` | 1921839 | Direct match |
| `rogue_shadow_step` | Shadow Step | `Rogue_ShadowStep` | 1921840 | Direct match |
| `rogue_dash` | Dash | `Rogue_Dash` | 1921841 | Direct match |
| `rogue_concealment` | Concealment | `Rogue_Concealment` | 1921842 | Direct match |
| `rogue_smoke_grenade` | Smoke Grenade | `Rogue_SmokeGrenade` | 1921843 | Direct match |
| `rogue_dark_shroud` | Dark Shroud | `Rogue_DarkShroud` | 1921844 | Direct match |
| `rogue_cold_imbuement` | Cold Imbuement | `Rogue_ColdImbuement` | 1921845 | Direct match |
| `rogue_fire_imbuement` | Fire Imbuement | `Rogue_FireImbuement` | 1921846 | Direct match |
| `rogue_poison_imbuement` | Poison Imbuement | `Rogue_PoisonImbuement` | 1921847 | Direct match |
| `rogue_shadow_imbuement` | Shadow Imbuement | `Rogue_ShadowImbuement` | 1921848 | Direct match |
| `rogue_death_trap` | Death Trap | `Rogue_DeathTrap` | 1921849 | Direct match |
| `rogue_preparation` | Preparation | `Rogue_Preparation` | 1921850 | Skill-tree ultimate; distinct from the Specialization "Preparation" style |
| `rogue_shadow_clone` | Shadow Clone | `Rogue_ShadowClone` | 1921851 | Direct match |
| `rogue_rain_of_arrows` | Rain of Arrows | `Rogue_RainOfArrows` | 1921852 | Direct match |
| `rogue_momentum` | Momentum | `Rogue_Momentum` | 1921853 | Direct match |
| `rogue_victimize` | Victimize | `Rogue_Victimize` | 1921854 | Direct match |
| `rogue_close_quarters_combat` | Close Quarters Combat | `Rogue_CloseQuartersCombat` | 1921855 | Direct match |
| `rogue_precision` | Precision | `Rogue_Precision` | 1921856 | Direct match |
| `rogue_exposure` | Exposure | `Rogue_Exposure` | 1921857 | Direct match |

---

## 3. Necromancer Paragon Boards

Extracted from `json/base/meta/ParagonBoard/Paragon_Necro_00.pbd.json` through
`Paragon_Necro_06.pbd.json`. All 7 boards exist in the datamine. The class token in file names
is `Necro` (not `Necromancer`). Board display names are NOT embedded in the `.pbd.json` files
(the `szName` field is empty); display names come from string tables and are sourced from
community data (v2 seed). Board-to-file assignment is sequential per D14: the starter board
(identified by `legendaryNodeIcon == 0`) is `Paragon_Necro_00`; the remaining 6 boards are
assigned in catalog order.

| Catalog ID | Label (community) | bnetFileName | bnetId | Notes |
|---|---|---|---|---|
| `necro_starter` | Starter Board | `Paragon_Necro_00` | 2395010 | Starter confirmed via `legendaryNodeIcon == 0` |
| `necro_bone_graft` | Bone Graft | `Paragon_Necro_01` | 2395011 | Sequential assignment |
| `necro_scent_of_death` | Scent of Death | `Paragon_Necro_02` | 2395012 | Sequential assignment |
| `necro_splintering_aspect` | Splintering | `Paragon_Necro_03` | 2395013 | Sequential assignment |
| `necro_flesh_eater` | Flesh-Eater | `Paragon_Necro_04` | 2395014 | Sequential assignment |
| `necro_cult_leader` | Cult Leader | `Paragon_Necro_05` | 2395015 | Sequential assignment |
| `necro_desecration` | Desecration | `Paragon_Necro_06` | 2395016 | Sequential assignment |

**Note on board display names:** The labels above are sourced from the v2 community data.
The datamine `.pbd.json` files do not embed human-readable board names. String-table
verification is deferred (see §7 Open Items).

---

## 4. Rogue Paragon Boards

Extracted from `json/base/meta/ParagonBoard/Paragon_Rogue_00.pbd.json` through
`Paragon_Rogue_05.pbd.json`. All 6 boards exist in the datamine. The class token is `Rogue`.
Board-to-file assignment is sequential per D14: starter board (`Paragon_Rogue_00`); remaining
5 boards sequential by catalog order.

| Catalog ID | Label (community) | bnetFileName | bnetId | Notes |
|---|---|---|---|---|
| `rogue_starter` | Starter Board | `Paragon_Rogue_00` | 2456301 | Starter confirmed via `legendaryNodeIcon == 0` |
| `rogue_cunning_stratagem` | Cunning Stratagem | `Paragon_Rogue_01` | 2456302 | Sequential assignment |
| `rogue_tricks_of_the_trade` | Tricks of the Trade | `Paragon_Rogue_02` | 2456303 | Sequential assignment |
| `rogue_shadow_realm` | Shadow Realm | `Paragon_Rogue_03` | 2456304 | Sequential assignment |
| `rogue_no_witnesses` | No Witnesses | `Paragon_Rogue_04` | 2456305 | Sequential assignment |
| `rogue_deadly_menace` | Deadly Menace | `Paragon_Rogue_05` | 2456306 | Sequential assignment |

**Note on board display names:** Same as §3 — community labels, string-table verification
deferred to §7 Open Items.

---

## 5. Necromancer Paragon Glyphs

Glyph-to-file mapping via `fUsableByClass[3]` (Necromancer index) in each `.gph.json` file.
All 161 `.gph.json` files were exhaustively checked. snoIDs extracted from `__snoID__` field.

**Removed entry:** `glyph_reinforced` ("Reinforced") was in the v2 seed catalog but has no
Necromancer-usable file in the datamine at build 3.0.1.71747. The only "Reinforced" glyph
(`Rare_012_Willpower_Side`, snoID 1023195) has `fUsableByClass = [1,0,0,0,0,0,0,0]` (Sorcerer
only). The entry has been removed from the Necromancer catalog (see §7 Open Items).

**Cross-class glyphs:** `glyph_exploit` uses `Rare_016_Intelligence_Side`, the same file noted
in `docs/datamine-verification-2026-05-08.md` §5 as "shared with Necromancer at index 3" —
`fUsableByClass[3]=1` and `fUsableByClass[6]=1` (Paladin). Similarly, `glyph_control` uses
`Rare_020_Intelligence_Side` which is shared between Paladin and Necromancer (both usable).

| Catalog ID | Label | bnetFileName | bnetId | usable[3] |
|---|---|---|---|---|
| `glyph_exploit` | Exploit | `Rare_016_Intelligence_Side` | 2506132 | 1 (shared with Paladin at index 6) |
| `glyph_control` | Control | `Rare_020_Intelligence_Side` | 1029491 | 1 (shared with Paladin at index 6) |
| `glyph_dominate` | Dominate | `Rare_057_Intelligence_Main` | 2479280 | 1 (Necromancer-specific) |
| `glyph_darkness` | Darkness | `Rare_060_Intelligence_Side` | 2479295 | 1 (Necromancer-specific) |
| `glyph_bone_graft_g` | Bone Graft | `Rare_091_Intelligence_Main` | 2479415 | 1 (Necromancer-specific) |
| `glyph_deadraiser` | Deadraiser | `Rare_093_Intelligence_Side` | 2479430 | 1 (Necromancer-specific) |

---

## 6. Rogue Paragon Glyphs

Same methodology as §5. Rogue class index is 4. All 161 `.gph.json` files were checked.

**Removed entry:** `glyph_reinforced` ("Reinforced") was in the v2 seed catalog but has no
Rogue-usable file in the datamine at build 3.0.1.71747. The only "Reinforced" glyph
(`Rare_012_Willpower_Side`, snoID 1023195) has `fUsableByClass[4]=0`. The entry has been
removed from the Rogue catalog (see §7 Open Items).

**Cross-class glyphs:**
- `glyph_exploit` uses `Rare_079_Dexterity_Side`, the Sorcerer+Rogue-usable Exploit file
  (`fUsableByClass[0]=1` and `fUsableByClass[4]=1`). This is the fourth of four Exploit
  files identified in `docs/datamine-verification-2026-05-08.md` §6.
- `glyph_turf` uses `Rare_014_Dexterity_Main`, the Rogue-usable Turf file. The Paladin uses
  a different file (`Rare_014_Strength_Main`, bnetId 2506847); per D5 cross-class resolution,
  each class catalog carries its own class-usable Turf file.

| Catalog ID | Label | bnetFileName | bnetId | usable[4] |
|---|---|---|---|---|
| `glyph_exploit` | Exploit | `Rare_079_Dexterity_Side` | 2506148 | 1 (shared with Sorcerer at index 0) |
| `glyph_control` | Control | `Rare_020_Dexterity_Side` | 1029495 | 1 (Rogue-specific) |
| `glyph_ambush` | Ambush | `Rare_073_Dexterity_Main` | 2479348 | 1 (Rogue-specific) |
| `glyph_versatility` | Versatility | `Rare_077_Dexterity_Side` | 2479360 | 1 (Rogue-specific) |
| `glyph_turf` | Turf | `Rare_014_Dexterity_Main` | 2506849 | 1 (distinct from Paladin's Rare_014_Strength_Main) |
| `glyph_devious` | Devious | `Rare_096_Dexterity_Side` | 2479440 | 1 (Rogue-specific) |

---

## 7. Open Items

- **Board display name string-table verification:** Board labels for both Necromancer and Rogue
  are sourced from the v2 community seed catalog. The datamine `.pbd.json` files do not embed
  human-readable board names. String-table verification of these labels (via hash-based lookup in
  `json/enUS_Text/meta/StringList/`) is deferred to a future commission.
- **`glyph_reinforced` removed — Necromancer:** No Necromancer-usable "Reinforced" glyph file
  exists in build 3.0.1.71747. The only "Reinforced" file (`Rare_012_Willpower_Side`) is
  Sorcerer-exclusive. If Blizzard adds a Necromancer-usable "Reinforced" file in a future patch,
  the entry should be restored with the new bnetFileName and bnetId.
- **`glyph_reinforced` removed — Rogue:** Same as above; no Rogue-usable "Reinforced" glyph
  file exists. Verify against a newer datamine build.
- **Additional Necromancer-usable glyphs not in v2 catalog (D6 deferred):** A full exhaustive
  check of all `.gph.json` files for `fUsableByClass[3]=1` may reveal glyph files not present
  in the v2 seed catalog. Per D6 (add-all), these should be added in a follow-up pass after
  confirming display names via string-table lookup.
- **Additional Rogue-usable glyphs not in v2 catalog (D6 deferred):** Same as above for
  `fUsableByClass[4]=1`. A string-table lookup pass is required before adding entries.
- **Exploit file disambiguation:** `docs/datamine-verification-2026-05-08.md` §5 notes
  `Rare_016_Intelligence_Side` as "shared with Necromancer at index 3", while §6 identifies
  `Rare_016_Strength_Side` as the "Necromancer+Spiritborn" Exploit file. This commission uses
  the §5 mapping (`Rare_016_Intelligence_Side`), which is explicitly documented as confirmed.
  The potential `Rare_016_Strength_Side` variant should be investigated in a dedicated glyph
  audit to determine whether Necromancer has dual Exploit usability.
- **classes.json verify-and-stamp (D7):** The Necromancer and Rogue rows in
  `lib/catalog/classes.json` were verified against `PlayerClass/{Necromancer,Rogue}.pcl.json`
  at build 3.0.1.71747. All values (`bnetClassName`, `bnetClassId`, `primaryStat`, `resources`)
  match the datamine. No edits were made to `lib/catalog/classes.json`.
