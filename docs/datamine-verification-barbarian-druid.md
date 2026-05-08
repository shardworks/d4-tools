# Datamine Verification Audit — Barbarian & Druid

```
Source: DiabloTools/d4data
Build:  3.0.1.71747 (Season 13 / Lord of Hatred)
Accessed: 2026-05-08
```

This document is the authoritative per-entry audit trail for every Barbarian and Druid entry in
`lib/catalog/skills/{Barbarian,Druid}.json` and `lib/catalog/paragon/{Barbarian,Druid}.json`.
Each row traces a catalog entry to its canonical datamine file at build 3.0.1.71747.

All skill bnetFileNames resolve to files under `json/base/meta/Power/` (e.g.,
`Barbarian_Bash.pow.json`). All paragon board bnetFileNames resolve to files under
`json/base/meta/ParagonBoard/` (e.g., `Paragon_Barb_00.pbd.json`). All glyph bnetFileNames
resolve to files under `json/base/meta/ParagonGlyph/` (e.g., `Rare_016_Dexterity_Side.gph.json`).

Display names for skills were confirmed from `json/enUS_Text/meta/StringList/Power_{FileName}.stl.json`
(confirmed to exist for all original-six-class skill Power files). Display names for glyphs were
confirmed from `json/enUS_Text/meta/StringList/Item_ParagonGlyph_{FileName}.stl.json` (where present)
or `json/enUS_Text/meta/StringList/ParagonGlyph_{FileName}.stl.json` for the Generic-named glyphs.

The `buildVersion.txt` path (`json/base/meta/buildVersion.txt`) is not present in the DiabloTools/d4data
repository at this build; the pinned version `3.0.1.71747` is consistent with the v6 Paladin/Warlock
verification performed at the same data snapshot.

---

## 1. Barbarian Skills

Extracted from `json/base/meta/SkillKit/Barbarian.skl.json`, `arActiveSkillEntries` (24 entries).
Display names confirmed from `Power_{FileName}.stl.json` string tables.
Category slugs derived from `tPrimaryTag.gbidSkillTag.name` in each Power file
(e.g., `Skill_Primary_Basic` → `basic`, `Skill_Primary_Weapon_Mastery` → `weapon-mastery`).

**Removed entries (no Power file in datamine, not in SkillKit arActiveSkillEntries):**

- `barb_flay` is NOT removed — see internal-name-divergence note below.
- `barb_seismic_slam` ("Seismic Slam"): No `Barbarian_SeismicSlam.pow.json` exists in the datamine
  and no matching SkillKit entry is present. Removed from catalog.
- `barb_unbridled_rage` ("Unbridled Rage"): key-passive skill; no `Barbarian_UnbridledRage.pow.json`
  exists and key passives are absent from `arActiveSkillEntries`. Removed from catalog.
- `barb_gushing_wounds` ("Gushing Wounds"): same as above. Removed.
- `barb_walking_arsenal` ("Walking Arsenal"): same as above. Removed.
- `barb_unconstrained` ("Unconstrained"): same as above. Removed.

**Added entries (in datamine SkillKit, not in v2 catalog):**

- `barb_mighty_throw`: The Power file `X1_Barbarian_WeaponThrow.pow.json` (snoID 1611316) has
  display name "Mighty Throw" (`Power_X1_Barbarian_WeaponThrow.stl.json`, `szLabel == "name"`).
  Category `Skill_Primary_Weapon_Mastery`. Added as a new catalog entry.

**Internal-name-divergence — Flay / Barbarian_Maim:**

The v2 catalog entry `barb_flay` (label "Flay") is confirmed in the datamine as Power file
`Barbarian_Maim.pow.json` (snoID 210431). The string table `Power_Barbarian_Maim.stl.json`
has `szLabel == "name"` → `"Flay"`. The internal Power file name (`Maim`) does not match the
in-game display name ("Flay"); this is the same internal-name-divergence pattern seen in v6
(e.g., `Paladin_StormBolt` displaying as "Holy Bolt"). The catalog id `barb_flay` and label
"Flay" are retained verbatim; only `bnetFileName: "Barbarian_Maim"` and `bnetId: 210431` are added.

**Category corrections:**

- `barb_leap`: v2 category was `defensive`; datamine `tPrimaryTag.gbidSkillTag.name` is
  `Skill_Primary_Brawling`. Corrected to `brawling`.
- `barb_steel_grasp`: v2 category was `brawling`; datamine tag is `Skill_Primary_Weapon_Mastery`.
  Corrected to `weapon-mastery`.

| Catalog ID | Display Name | bnetFileName | bnetId | Notes |
|---|---|---|---|---|
| `barb_bash` | Bash | `Barbarian_Bash` | 200765 | Direct match |
| `barb_flay` | Flay | `Barbarian_Maim` | 210431 | Internal name `Maim`; display "Flay" confirmed from string table |
| `barb_frenzy` | Frenzy | `Barbarian_Frenzy` | 210919 | Direct match |
| `barb_lunging_strike` | Lunging Strike | `Barbarian_LungingStrike` | 206504 | Direct match |
| `barb_double_swing` | Double Swing | `Barbarian_DoubleSwing` | 208000 | Direct match |
| `barb_hammer_of_ancients` | Hammer of the Ancients | `Barbarian_HammeroftheAncients` | 213673 | Internal name omits spaces; display confirmed |
| `barb_rend` | Rend | `Barbarian_Rend` | 214786 | Direct match |
| `barb_upheaval` | Upheaval | `Barbarian_Upheaval` | 202484 | Direct match |
| `barb_whirlwind` | Whirlwind | `Barbarian_Whirlwind` | 206435 | Direct match |
| `barb_ground_stomp` | Ground Stomp | `Barbarian_GroundStomp` | 186358 | Direct match |
| `barb_rallying_cry` | Rallying Cry | `Barbarian_RallyingCry` | 211938 | Direct match |
| `barb_challenging_shout` | Challenging Shout | `Barbarian_ChallengingShout` | 375484 | Direct match |
| `barb_iron_skin` | Iron Skin | `Barbarian_IronSkin` | 512222 | Direct match |
| `barb_leap` | Leap | `Barbarian_Leap` | 196545 | Category corrected: `defensive` → `brawling` |
| `barb_charge` | Charge | `Barbarian_Charge` | 204662 | Direct match |
| `barb_kick` | Kick | `Barbarian_Kick` | 199516 | Direct match |
| `barb_war_cry` | War Cry | `Barbarian_WarCry` | 184600 | Direct match |
| `barb_steel_grasp` | Steel Grasp | `Barbarian_SteelGrasp` | 964631 | Category corrected: `brawling` → `weapon-mastery` |
| `barb_death_blow` | Death Blow | `Barbarian_DeathBlow` | 323105 | Direct match |
| `barb_rupture` | Rupture | `Barbarian_Rupture` | 215027 | Direct match |
| `barb_mighty_throw` | Mighty Throw | `X1_Barbarian_WeaponThrow` | 1611316 | Added; internal name `X1_Barbarian_WeaponThrow`; display "Mighty Throw" confirmed |
| `barb_call_of_ancients` | Call of the Ancients | `Barbarian_CalloftheAncients` | 309802 | Internal name omits spaces/articles; display confirmed |
| `barb_iron_maelstrom` | Iron Maelstrom | `Barbarian_IronMaelstrom` | 217175 | Direct match |
| `barb_wrath_of_berserker` | Wrath of the Berserker | `Barbarian_WrathoftheBerserker` | 211871 | Internal name omits spaces/articles; display confirmed |

**Removed entries (no datamine evidence — audit trail):**

| Catalog ID (removed) | v2 Label | Evidence of absence |
|---|---|---|
| `barb_seismic_slam` | Seismic Slam | HTTP 404 on `Barbarian_SeismicSlam.pow.json`; absent from SkillKit `arActiveSkillEntries` |
| `barb_unbridled_rage` | Unbridled Rage | HTTP 404 on `Barbarian_UnbridledRage.pow.json`; key passives not in `arActiveSkillEntries` |
| `barb_gushing_wounds` | Gushing Wounds | HTTP 404 on `Barbarian_GushingWounds.pow.json`; key passives not in `arActiveSkillEntries` |
| `barb_walking_arsenal` | Walking Arsenal | HTTP 404 on `Barbarian_WalkingArsenal.pow.json`; key passives not in `arActiveSkillEntries` |
| `barb_unconstrained` | Unconstrained | HTTP 404 on `Barbarian_Unconstrained.pow.json`; key passives not in `arActiveSkillEntries` |

---

## 2. Druid Skills

Extracted from `json/base/meta/SkillKit/Druid.skl.json`, `arActiveSkillEntries` (26 entries).
Display names confirmed from `Power_{FileName}.stl.json` string tables.

**Removed entries (key passives, no Power file in datamine):**

- `druid_bestial_rampage` ("Bestial Rampage"): HTTP 404 on `Druid_BestialRampage.pow.json`;
  absent from SkillKit `arActiveSkillEntries`. Removed.
- `druid_natural_balance` ("Natural Balance"): same. Removed.
- `druid_natures_fury` ("Nature's Fury"): same. Removed.
- `druid_earthen_might` ("Earthen Might"): same. Removed.

**Added entries (in datamine SkillKit, not in v2 catalog):**

- `druid_lightning_storm`: `Druid_LightningStorm.pow.json` (snoID 548399), display "Lightning Storm",
  category `Skill_Primary_Core`. Added as new catalog entry.
- `druid_blood_howl`: `Druid_BloodHowl.pow.json` (snoID 566517), display "Blood Howl",
  category `Skill_Primary_Defensive`. Added as new catalog entry.
- `druid_stone_burst`: `Druid_StoneBurst.pow.json` (snoID 1473878), display "Stone Burst",
  category `Skill_Primary_Core`. Added as new catalog entry.

**Internal-name-divergences:**

- `druid_earth_spike` → `Druid_Earthspike_Instant` (snoID 543387): internal file name has
  `_Instant` suffix; display "Earth Spike" confirmed from string table.
- `druid_wolves` → `Druid_WolfPack` (snoID 265663): internal file name is `WolfPack`;
  display "Wolves" confirmed from `Power_Druid_WolfPack.stl.json`.
- `druid_shred` → `Druid_Shred_NEW` (snoID 1256958): internal file name has `_NEW` suffix
  (legacy working suffix); display "Shred" confirmed from string table.
- `druid_landslide` → `Druid_landslide` (snoID 313893): internal file name uses lowercase `l`;
  display "Landslide" confirmed from `Power_Druid_Landslide.stl.json` (capital-L path).

**Category corrections:**

- `druid_trample`: v2 category was `defensive`; datamine tag is `Skill_Primary_Wrath`.
  Corrected to `wrath`.
- `druid_rabies`: v2 category was `core`; datamine tag is `Skill_Primary_Wrath`.
  Corrected to `wrath`.

| Catalog ID | Display Name | bnetFileName | bnetId | Notes |
|---|---|---|---|---|
| `druid_maul` | Maul | `Druid_Maul` | 309070 | Direct match |
| `druid_claw` | Claw | `Druid_Claw` | 439581 | Direct match |
| `druid_storm_strike` | Storm Strike | `Druid_StormStrike` | 309320 | Direct match |
| `druid_wind_shear` | Wind Shear | `Druid_WindShear` | 356587 | Direct match |
| `druid_earth_spike` | Earth Spike | `Druid_Earthspike_Instant` | 543387 | Internal name `Earthspike_Instant`; display "Earth Spike" confirmed |
| `druid_landslide` | Landslide | `Druid_landslide` | 313893 | Internal name uses lowercase `l`; display "Landslide" confirmed |
| `druid_pulverize` | Pulverize | `Druid_Pulverize` | 272138 | Direct match |
| `druid_shred` | Shred | `Druid_Shred_NEW` | 1256958 | Internal name `Shred_NEW` (legacy suffix); display "Shred" confirmed |
| `druid_tornado` | Tornado | `Druid_Tornado` | 304065 | Direct match |
| `druid_lightning_storm` | Lightning Storm | `Druid_LightningStorm` | 548399 | Added; display "Lightning Storm" confirmed |
| `druid_stone_burst` | Stone Burst | `Druid_StoneBurst` | 1473878 | Added; display "Stone Burst" confirmed |
| `druid_cyclone_armor` | Cyclone Armor | `Druid_CycloneArmor` | 280119 | Direct match |
| `druid_earthen_bulwark` | Earthen Bulwark | `Druid_EarthenBulwark` | 333421 | Direct match |
| `druid_debilitating_roar` | Debilitating Roar | `Druid_DebilitatingRoar` | 336238 | Direct match |
| `druid_blood_howl` | Blood Howl | `Druid_BloodHowl` | 566517 | Added; display "Blood Howl" confirmed |
| `druid_ravens` | Ravens | `Druid_Ravens` | 281516 | Direct match |
| `druid_wolves` | Wolves | `Druid_WolfPack` | 265663 | Internal name `WolfPack`; display "Wolves" confirmed |
| `druid_vine_creeper` | Vine Creeper | `Druid_VineCreeper` | 314601 | Direct match |
| `druid_boulder` | Boulder | `Druid_Boulder` | 238345 | Direct match |
| `druid_hurricane` | Hurricane | `Druid_Hurricane` | 258990 | Direct match |
| `druid_trample` | Trample | `Druid_Trample` | 258243 | Category corrected: `defensive` → `wrath` |
| `druid_rabies` | Rabies | `Druid_Rabies` | 416337 | Category corrected: `core` → `wrath` |
| `druid_petrify` | Petrify | `Druid_Petrify` | 351722 | Direct match |
| `druid_lacerate` | Lacerate | `Druid_Lacerate` | 394251 | Direct match |
| `druid_cataclysm` | Cataclysm | `Druid_Cataclysm` | 266570 | Direct match |
| `druid_grizzly_rage` | Grizzly Rage | `Druid_GrizzlyRage` | 267021 | Direct match |

**Removed entries (no datamine evidence — audit trail):**

| Catalog ID (removed) | v2 Label | Evidence of absence |
|---|---|---|
| `druid_bestial_rampage` | Bestial Rampage | HTTP 404 on `Druid_BestialRampage.pow.json`; key passives not in `arActiveSkillEntries` |
| `druid_natural_balance` | Natural Balance | HTTP 404 on `Druid_NaturalBalance.pow.json`; key passives not in `arActiveSkillEntries` |
| `druid_natures_fury` | Nature's Fury | HTTP 404 on `Druid_NaturesFury.pow.json`; key passives not in `arActiveSkillEntries` |
| `druid_earthen_might` | Earthen Might | HTTP 404 on `Druid_EarthenMight.pow.json`; key passives not in `arActiveSkillEntries` |

---

## 3. Barbarian Paragon Boards

Extracted from `json/base/meta/ParagonBoard/Paragon_Barb_00.pbd.json` through
`Paragon_Barb_10.pbd.json`. **`Paragon_Barb_09.pbd.json` does not exist in the datamine.**
The sequence goes 00–08 then 10; 09 is absent (same gap pattern as Warlock in v6). The 10 boards
present are assigned to catalog entries in sequential order. Board display names are NOT embedded
in the `.pbd.json` files (the `szName` field is empty); labels come from community/v2 seed data
for the first 8 and are placeholder-labelled for the 2 datamine extras.

**Note on file prefix:** Barbarian paragon board files use the abbreviated prefix `Paragon_Barb_`
(not `Paragon_Barbarian_`). All `bnetFileName` values use the actual file basename.

| Catalog ID | Label | bnetFileName | bnetId | Notes |
|---|---|---|---|---|
| `barb_starter` | Starter Board | `Paragon_Barb_00` | 921459 | Sequential index 00; starter board confirmed by file-index position |
| `barb_bone_breaker` | Bone Breaker | `Paragon_Barb_01` | 921475 | Community-sourced label (v2 seed) |
| `barb_hemorrhage` | Hemorrhage | `Paragon_Barb_02` | 921460 | Community-sourced label |
| `barb_blood_rage` | Blood Rage | `Paragon_Barb_03` | 921481 | Community-sourced label |
| `barb_carnage` | Carnage | `Paragon_Barb_04` | 939079 | Community-sourced label |
| `barb_warbringer` | Warbringer | `Paragon_Barb_05` | 993298 | Community-sourced label |
| `barb_weapons_master` | Weapons Master | `Paragon_Barb_06` | 997728 | Community-sourced label |
| `barb_flawless_technique` | Flawless Technique | `Paragon_Barb_07` | 1194322 | Community-sourced label |
| `barb_paragon_board_8` | Paragon Board 8 | `Paragon_Barb_08` | 1194330 | Added; unconfirmed-label (placeholder) |
| `barb_paragon_board_10` | Paragon Board 10 | `Paragon_Barb_10` | 1985448 | Added; unconfirmed-label (placeholder); `Paragon_Barb_09` absent from datamine |

**Note on board display names:** Labels for boards 00–07 are sourced from v2 community data.
String-table verification requires hash-based lookup not yet implemented. The board-to-file
sequential assignment (catalog order → file index) is the verified mapping.

---

## 4. Druid Paragon Boards

Extracted from `json/base/meta/ParagonBoard/Paragon_Druid_00.pbd.json` through
`Paragon_Druid_10.pbd.json`. **`Paragon_Druid_09.pbd.json` does not exist in the datamine.**
Same 00–08, 10 gap pattern as Barbarian and Warlock. The 10 boards present are assigned
sequentially. The v2 seed had 7 boards; 3 datamine-extra boards (07, 08, 10) are added
with placeholder labels.

| Catalog ID | Label | bnetFileName | bnetId | Notes |
|---|---|---|---|---|
| `druid_starter` | Starter Board | `Paragon_Druid_00` | 940011 | Sequential index 00; isStarterBoard=true |
| `druid_thunderstruck` | Thunderstruck | `Paragon_Druid_01` | 939952 | Community-sourced label |
| `druid_ancestral_guidance` | Ancestral Guidance | `Paragon_Druid_02` | 939954 | Community-sourced label |
| `druid_lust_for_carnage` | Lust for Carnage | `Paragon_Druid_03` | 939976 | Community-sourced label |
| `druid_constricting_tendrils` | Constricting Tendrils | `Paragon_Druid_04` | 939984 | Community-sourced label |
| `druid_wild_strikes` | Wild Strikes | `Paragon_Druid_05` | 994015 | Community-sourced label |
| `druid_the_animal_spirit` | The Animal Spirit | `Paragon_Druid_06` | 997766 | Community-sourced label |
| `druid_paragon_board_7` | Paragon Board 7 | `Paragon_Druid_07` | 1195795 | Added; unconfirmed-label (placeholder) |
| `druid_paragon_board_8` | Paragon Board 8 | `Paragon_Druid_08` | 1195797 | Added; unconfirmed-label (placeholder) |
| `druid_paragon_board_10` | Paragon Board 10 | `Paragon_Druid_10` | 1985817 | Added; unconfirmed-label (placeholder); `Paragon_Druid_09` absent from datamine |

---

## 5. Barbarian Paragon Glyphs

Glyph-to-file mapping via `fUsableByClass` array in each `.gph.json` file.
Class indices: 0=Sorcerer, 1=Druid, 2=Barbarian, 3=Necromancer, 4=Rogue, 5=Spiritborn,
6=Paladin, 7=Warlock. All 160 `Rare_*.gph.json` files were exhaustively checked.
snoIDs extracted from `__snoID__` field. Display names from
`Item_ParagonGlyph_{FileName}.stl.json` string tables.

**Removed entries from v2 catalog:**

- `glyph_reinforced` ("Reinforced"): The only "Reinforced" glyph (`Rare_012_Willpower_Side`,
  snoID 1023195) has `fUsableByClass = [1,0,0,0,0,0,0,0]` — Sorcerer-only.
  `fUsableByClass[2] == 0`. Removed from Barbarian catalog.
- `glyph_fervent` ("Fervent"): No Barbarian-usable glyph file with display name "Fervent"
  exists in the datamine (exhaustive check of all 160 Rare glyph files). Removed.
- `glyph_wrathful` ("Wrathful"): No Barbarian-usable glyph file with display name "Wrathful"
  exists. The closest match is `Rare_030_Dexterity_Side` with display "Wrath" (a distinct entry
  now added as `glyph_wrath`). Removed.
- `glyph_berserker` ("Berserker"): No Barbarian-usable glyph file with display name "Berserker"
  exists in the datamine. Removed.

**Added entries (datamine-usable by Barbarian, not in v2 catalog):**

All 23 Barbarian-usable glyph files found in the datamine are included in the catalog per D11
(datamine-extra glyphs add to catalog). The 4 kept from v2 and 19 new entries are listed below.

| Catalog ID | Label | bnetFileName | bnetId | usable[2] | Notes |
|---|---|---|---|---|---|
| `glyph_imbiber` | Imbiber | `Rare_011_Willpower_Side` | 1071719 | 1 | Added; also usable by Sorcerer, Rogue, Paladin |
| `glyph_territorial` | Territorial | `Rare_014_Dexterity_Side` | 1023197 | 1 | Kept from v2; also usable by Sorcerer, Druid, Rogue |
| `glyph_exploit` | Exploit | `Rare_016_Dexterity_Side` | 1023199 | 1 | Kept from v2; also usable by Druid |
| `glyph_ambidextrous` | Ambidextrous | `Rare_021_Strength_Main` | 1027075 | 1 | Added; Barbarian-exclusive |
| `glyph_might` | Might | `Rare_022_Strength_Main` | 1027083 | 1 | Added; Barbarian-exclusive |
| `glyph_cleaver` | Cleaver | `Rare_023_Strength_Main` | 1027084 | 1 | Added; Barbarian-exclusive |
| `glyph_seething` | Seething | `Rare_024_Strength_Main` | 1027085 | 1 | Added; Barbarian-exclusive |
| `glyph_crusher` | Crusher | `Rare_025_Strength_Main` | 1027086 | 1 | Added; Barbarian-exclusive |
| `glyph_executioner` | Executioner | `Rare_026_Strength_Main` | 1027087 | 1 | Added; Barbarian-exclusive |
| `glyph_ire` | Ire | `Rare_027_Strength_Main` | 1027088 | 1 | Added; Barbarian-exclusive |
| `glyph_marshal` | Marshal | `Rare_028_Strength_Main` | 1027089 | 1 | Added; Barbarian-exclusive |
| `glyph_bloodfeeder` | Bloodfeeder | `Rare_029_Dexterity_Side` | 1027090 | 1 | Added; Barbarian-exclusive |
| `glyph_wrath` | Wrath | `Rare_030_Dexterity_Side` | 1027091 | 1 | Added; Barbarian-exclusive |
| `glyph_weapon_master` | Weapon Master | `Rare_031_Dexterity_Side` | 1027093 | 1 | Added; Barbarian-exclusive |
| `glyph_mortal_draw` | Mortal Draw | `Rare_032_Dexterity_Side` | 1027094 | 1 | Kept from v2; Barbarian-exclusive |
| `glyph_revenge` | Revenge | `Rare_033_Willpower_Side` | 1027095 | 1 | Added; Barbarian-exclusive |
| `glyph_undaunted` | Undaunted | `Rare_034_Willpower_Side` | 1027096 | 1 | Kept from v2; also usable by Rogue, Paladin |
| `glyph_dominate` | Dominate | `Rare_035_Willpower_Side` | 1027097 | 1 | Added; Barbarian-exclusive |
| `glyph_disembowel` | Disembowel | `Rare_036_Willpower_Side` | 1027098 | 1 | Added; Barbarian-exclusive |
| `glyph_brawl` | Brawl | `Rare_037_Willpower_Side` | 1027099 | 1 | Added; Barbarian-exclusive |
| `glyph_twister` | Twister | `Rare_080_Strength_Main` | 1621704 | 1 | Added; Barbarian-exclusive |
| `glyph_rumble` | Rumble | `Rare_081_Strength_Main` | 1622788 | 1 | Added; Barbarian-exclusive |
| `glyph_challenger` | Challenger | `Rare_Str_Generic` | 2073373 | 1 | Added; also usable by Paladin; display name from `ParagonGlyph_Rare_Str_Generic.stl.json` |

**Note on "Undaunted" cross-class variants:** The Barbarian `glyph_undaunted` uses
`Rare_034_Willpower_Side` (snoID 1027096). The Druid catalog has a distinct `glyph_undaunted`
at `Rare_034_Intelligence_Side` (snoID 1068821) — a separate class-specific file with the same
display name.

---

## 6. Druid Paragon Glyphs

Same methodology as §5. Druid class index is 1. All 160 `Rare_*.gph.json` files were checked.

**Removed entries from v2 catalog:**

- `glyph_reinforced` ("Reinforced"): `Rare_012_Willpower_Side` has `fUsableByClass[1] == 0`
  (Sorcerer-only). Removed from Druid catalog.
- `glyph_nature_magic` ("Nature Magic"): Exhaustive check of all 160 Rare glyph files finds
  no Druid-usable file with display name "Nature Magic". Removed.
- `glyph_control` ("Control"): No Druid-usable "Control" file exists. The known "Control"
  glyphs are `Rare_020_Intelligence_Side` (Paladin-exclusive, snoID 1029491) and
  `Rare_125_Willpower_Main` (Warlock-exclusive, snoID 2533053); neither has `fUsableByClass[1]=1`.
  Removed from Druid catalog.

**Added entries (datamine-usable by Druid, not in v2 catalog):**

All 23 Druid-usable glyph files found in the datamine are included per D11.

| Catalog ID | Label | bnetFileName | bnetId | usable[1] | Notes |
|---|---|---|---|---|---|
| `glyph_guzzler` | Guzzler | `Rare_011_Intelligence_Side` | 1023194 | 1 | Added; also usable by Spiritborn, Warlock |
| `glyph_protector` | Protector | `Rare_012_Intelligence_Side` | 1068816 | 1 | Added; Druid-exclusive |
| `glyph_poise` | Poise | `Rare_013_Dexterity_Side` | 1028219 | 1 | Added; Druid-exclusive |
| `glyph_territorial` | Territorial | `Rare_014_Dexterity_Side` | 1023197 | 1 | Kept from v2; also usable by Sorcerer, Barbarian, Rogue |
| `glyph_exploit` | Exploit | `Rare_016_Dexterity_Side` | 1023199 | 1 | Kept from v2; also usable by Barbarian |
| `glyph_undaunted` | Undaunted | `Rare_034_Intelligence_Side` | 1068821 | 1 | Added; Druid-exclusive file; distinct from Barbarian `glyph_undaunted` (`Rare_034_Willpower_Side`) |
| `glyph_dominate` | Dominate | `Rare_035_Intelligence_Side` | 1068833 | 1 | Added; Druid-exclusive file; distinct from Barbarian `glyph_dominate` (`Rare_035_Willpower_Side`) |
| `glyph_fang_claw` | Fang and Claw | `Rare_039_Willpower_Main` | 1028226 | 1 | Kept from v2; Druid-exclusive |
| `glyph_earth_and_sky` | Earth and Sky | `Rare_040_Willpower_Main` | 1028227 | 1 | Kept from v2; Druid-exclusive |
| `glyph_wilds` | Wilds | `Rare_041_Intelligence_Side` | 1028228 | 1 | Added; Druid-exclusive |
| `glyph_werebear` | Werebear | `Rare_042_Willpower_Main` | 1028229 | 1 | Added; Druid-exclusive |
| `glyph_werewolf` | Werewolf | `Rare_043_Willpower_Main` | 1028230 | 1 | Added; Druid-exclusive |
| `glyph_human` | Human | `Rare_044_Willpower_Main` | 1028231 | 1 | Added; Druid-exclusive |
| `glyph_bane` | Bane | `Rare_045_Intelligence_Side` | 1028232 | 1 | Added; Druid-exclusive |
| `glyph_keeper` | Keeper | `Rare_046_Intelligence_Side` | 1028233 | 1 | Added; Druid-exclusive |
| `glyph_fulminate` | Fulminate | `Rare_047_Dexterity_Side` | 1028234 | 1 | Added; Druid-exclusive |
| `glyph_tracker` | Tracker | `Rare_048_Dexterity_Side` | 1028235 | 1 | Added; Druid-exclusive |
| `glyph_outmatch` | Outmatch | `Rare_049_Dexterity_Side` | 1028236 | 1 | Added; Druid-exclusive file; distinct from Paladin `glyph_outmatch` (`Rare_049_Strength_Main`) |
| `glyph_spirit` | Spirit | `Rare_050_Dexterity_Side` | 1028237 | 1 | Added; Druid-exclusive file; distinct from Paladin `glyph_spirit` (`Rare_050_Willpower_Side`) |
| `glyph_shapeshifter` | Shapeshifter | `Rare_051_Dexterity_Side` | 1028238 | 1 | Added; Druid-exclusive |
| `glyph_tectonic` | Tectonic | `Rare_086_Dexterity_Side` | 1624740 | 1 | Added; Druid-exclusive |
| `glyph_electrocution` | Electrocution | `Rare_087_Willpower_Main` | 1627925 | 1 | Added; Druid-exclusive |
| `glyph_headhunter` | Headhunter | `Rare_Will_Generic` | 2117207 | 1 | Added; also usable by Warlock; display name from `ParagonGlyph_Rare_Will_Generic.stl.json` |

**Note on cross-class variants with same display name:** Several glyph labels appear in both
Barbarian and Druid catalogs but map to distinct files (different snoIDs):
- "Undaunted": Barbarian → `Rare_034_Willpower_Side` (1027096), Druid → `Rare_034_Intelligence_Side` (1068821)
- "Dominate": Barbarian → `Rare_035_Willpower_Side` (1027097), Druid → `Rare_035_Intelligence_Side` (1068833)
- "Territorial" and "Exploit": Barbarian and Druid share the same file (same snoID).

**Note on "Outmatch" and "Spirit":** The Druid versions (`Rare_049_Dexterity_Side` and
`Rare_050_Dexterity_Side`) are distinct files from the Paladin versions
(`Rare_049_Strength_Main` snoID 2506253 and `Rare_050_Willpower_Side` snoID 2506810).

---

## 7. Open Items

- **Board display name string-table verification:** Board labels for boards 00–07 in both
  Barbarian and Druid are sourced from v2 community seed data. Verification against
  `json/enUS_Text/meta/StringList/` string tables requires hash-based lookup (board name hashes
  stored in `ParagonBoard.pbd.json`). Deferred.
- **Placeholder board labels (`barb_paragon_board_8`, `barb_paragon_board_10`,
  `druid_paragon_board_7`, `druid_paragon_board_8`, `druid_paragon_board_10`):** These 5 entries
  carry placeholder labels ("Paragon Board N") flagged as `unconfirmed-label`. Update when
  string-table verification is complete or community labels are confirmed.
- **`Paragon_Barb_09` and `Paragon_Druid_09` absence:** The gap in both board file sequences
  (00–08, 10) mirrors the Warlock pattern from v6. Possible explanations: removed/merged board,
  pre-release placeholder. Verify in a future datamine build.
- **Key passive skills removed (Barbarian and Druid):** Five Barbarian key passives
  (Seismic Slam, Unbridled Rage, Gushing Wounds, Walking Arsenal, Unconstrained) and four Druid
  key passives (Bestial Rampage, Natural Balance, Nature's Fury, Earthen Might) have no
  corresponding Power files in the datamine. These were in the v2 community seed; their Power
  files may exist under different names, or the key passive system may be implemented via a
  different data structure not captured by `arActiveSkillEntries`. Verify in a future
  investigation or when Power file naming for key passives is confirmed.
- **`Rare_Str_Generic` (glyph_challenger) and `Rare_Will_Generic` (glyph_headhunter):** Display
  names confirmed from `ParagonGlyph_*.stl.json` (not the `Item_ParagonGlyph_*` pattern used for
  other glyphs). These are the only two glyphs using a different string table naming convention.
