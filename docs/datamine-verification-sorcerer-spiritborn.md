# Datamine Verification Audit — Sorcerer & Spiritborn

```
Source:   DiabloTools/d4data
Build:    3.0.1.71747 (Season 13 / Lord of Hatred)
Accessed: 2026-05-08
```

---

## §1 Sorcerer Skills

Derived from `json/base/meta/SkillKit/Sorcerer.skl.json` (`arActiveSkillEntries`, 25 entries) and individual Power files at `json/base/meta/Power/Sorcerer_<Name>.pow.json`. Categories confirmed from `tPrimaryTag.gbidSkillTag.name` in each Power file. Key-passive Power files (Shatter, Permafrost, Avalanche, Endless Pyre, Vyr's Mastery, Static Discharge) returned 404 under every naming convention tested — see Removed Entries below.

> **Removed entries** (were in v2 seed; not present in datamine build 3.0.1.71747):
>
> - `sorc_shatter` ("Shatter", key-passive) — Power file not found under any naming convention. v2 label appears to be from a pre-launch or pre-LoH build of the skill tree. Removed.
> - `sorc_permafrost` ("Permafrost", key-passive) — Same as above. Removed.
> - `sorc_avalanche` ("Avalanche", key-passive) — Same as above. Removed.
> - `sorc_endless_pyre` ("Endless Pyre", key-passive) — Same as above. Removed.
> - `sorc_vyr_mastery` ("Vyr's Mastery", key-passive) — Same as above. Removed.
> - `sorc_static_discharge` ("Static Discharge", key-passive) — Pre-launch name confirmed absent. Removed.
>
> Note: In build 3.0.1.71747 the Sorcerer talent tree provides 14 passive stat-bonus nodes (Hoarfrost, Frigid Breeze, Elemental Synergies, etc.) in place of the key-passive selection mechanic present in earlier builds. These passive nodes are not cataloged as "skills" — they are stat-node entries similar to the passive inter-skill nodes on other classes.

| Catalog ID | Display Name | bnetFileName | bnetId | Notes |
|---|---|---|---|---|
| `sorc_arc_lash` | Arc Lash | `Sorcerer_ArcLash` | 297902 | Direct match |
| `sorc_spark` | Spark | `Sorcerer_Spark` | 143483 | Direct match |
| `sorc_frost_bolt` | Frost Bolt | `Sorcerer_FrostBolt` | 287256 | Direct match |
| `sorc_fire_bolt` | Fire Bolt | `Sorcerer_FireBolt` | 153249 | Direct match |
| `sorc_charged_bolts` | Charged Bolts | `Sorcerer_ChargedBolt` | 171937 | Internal name `ChargedBolt` (no trailing s); display "Charged Bolts" confirmed from string list |
| `sorc_ice_shards` | Ice Shards | `Sorcerer_IceShards` | 293195 | Direct match |
| `sorc_fireball` | Fireball | `Sorcerer_Fireball` | 165023 | Direct match |
| `sorc_incinerate` | Incinerate | `Sorcerer_Incinerate` | 292737 | Direct match |
| `sorc_chain_lightning` | Chain Lightning | `Sorcerer_ChainLightning` | 292757 | Direct match |
| `sorc_frozen_orb` | Frozen Orb | `Sorcerer_FrozenOrb` | 291347 | Direct match |
| `sorc_teleport` | Teleport | `Sorcerer_Teleport` | 288106 | Direct match |
| `sorc_ice_armor` | Ice Armor | `Sorcerer_IceArmor` | 297039 | Direct match |
| `sorc_flame_shield` | Flame Shield | `Sorcerer_FlameShield` | 167341 | Direct match |
| `sorc_frost_nova` | Frost Nova | `Sorcerer_FrostNova` | 291215 | Direct match |
| `sorc_hydra` | Hydra | `Sorcerer_Hydra` | 146743 | Direct match |
| `sorc_ice_blades` | Ice Blades | `Sorcerer_IceBlades` | 291492 | Direct match |
| `sorc_lightning_spear` | Lightning Spear | `Sorcerer_LightningSpear` | 292074 | Direct match |
| `sorc_familiar` | Familiar | `X1_Sorcerer_Familiar` | 1627075 | Added — present in `arActiveSkillEntries` with `X1_` seasonal prefix; v2 seed omitted this entry |
| `sorc_blizzard` | Blizzard | `Sorcerer_Blizzard` | 291403 | Direct match |
| `sorc_meteor` | Meteor | `Sorcerer_Meteor` | 296998 | Direct match |
| `sorc_ball_lightning` | Ball Lightning | `Sorcerer_BallLightning` | 514030 | Direct match |
| `sorc_firewall` | Firewall | `Sorcerer_Firewall` | 111422 | Added — present in `arActiveSkillEntries`; v2 seed omitted this mastery entry |
| `sorc_unstable_currents` | Unstable Currents | `Sorcerer_UnstableCurrents` | 517417 | Direct match |
| `sorc_inferno` | Inferno | `Sorcerer_Inferno` | 294198 | Direct match |
| `sorc_deep_freeze` | Deep Freeze | `Sorcerer_DeepFreeze` | 291827 | Direct match |

---

## §2 Spiritborn Skills

Derived from `json/base/meta/SkillKit/Spiritborn.skl.json` (`arActiveSkillEntries`, 24 entries) and per-skill Power files at `json/base/meta/Power/Spiritborn_<Spirit>_<Tier>.pow.json`. Display names confirmed from `json/enUS_Text/meta/StringList/Power_Spiritborn_<Spirit>_<Tier>.stl.json`. Key passives from `Spiritborn_Talent_KeyPassive_{1,3,4,5}.pow.json` (no `_2` file exists in this build).

> **Removed entries** (were in v2 seed; not present in datamine build 3.0.1.71747):
>
> - `sb_crush` ("Crush", basic) — No Power file matches this display name. Likely a v2 fabrication; Gorilla Basic is "Rock Splitter". Removed.
> - `sb_ravage` ("Ravage", core) — No Power file matches. The closest datamine entry is `Spiritborn_Jaguar_Focus` = "Ravager". Removed; `sb_ravager` added.
> - `sb_shroud_of_feathers` ("Shroud of Feathers", defensive) — No Power file matches. Removed.
> - `sb_eagle_eye` ("Eagle Eye", brawling) — No Power file matches this display name. Removed.
> - `sb_veil_of_steel` ("Veil of Steel", brawling) — No Power file matches. Removed.
> - `sb_apex` ("Apex", ultimate) — No Power file matches. The four datamine ultimates are The Seeker, The Protector, The Hunter, The Devourer. Removed.
> - `sb_supremacy` ("Supremacy", ultimate) — Same as above. Removed.
> - `sb_dominant` ("Dominant", key-passive) — No `Spiritborn_Talent_KeyPassive_*` file maps to this display name. Removed.
> - `sb_packleader` ("Pack Leader", key-passive) — Same as above. Removed.
> - `sb_resonance` ("Resonance", key-passive) — Same as above. "Noxious Resonance" is a distinct datamine key passive (`KeyPassive_4`); the v2 label "Resonance" does not match.
>
> Note: The v2 catalog had a fabricated `brawling` category for four skills. The datamine has no `Skill_Primary_Brawling` tag; Spiritborn middle-tier categories are `basic`, `core`, `potency`, `defensive`, `focus`, and `ultimate`.

> **Category corrections** on surviving entries (v2 category → datamine category):
>
> - `sb_quill_volley`: basic → **core** (Eagle Core, `Spiritborn_Eagle_Core`)
> - `sb_rake`: basic → **core** (Jaguar Core, `Spiritborn_Jaguar_Core`)
> - `sb_rock_splitter`: core → **basic** (Gorilla Basic, `Spiritborn_Gorilla_Basic`)
> - `sb_razor_wings`: defensive → **potency** (Eagle Potency1, `Spiritborn_Eagle_Potency1`)
> - `sb_crushing_hand`: brawling → **core** (Gorilla Core, `Spiritborn_Gorilla_Core`)
> - `sb_scourge`: core → **defensive** (Centipede Defensive, `Spiritborn_Centipede_Defensive`)
> - `sb_the_seeker`: brawling → **ultimate** (Eagle Ultimate, `Spiritborn_Eagle_Ultimate`)

| Catalog ID | Display Name | bnetFileName | bnetId | Notes |
|---|---|---|---|---|
| `sb_thunderspike` | Thunderspike | `Spiritborn_Eagle_Basic` | 1834476 | Direct match; tPrimaryTag = basic |
| `sb_rock_splitter` | Rock Splitter | `Spiritborn_Gorilla_Basic` | 1817045 | Category corrected core→basic |
| `sb_thrash` | Thrash | `Spiritborn_Jaguar_Basic` | 1834473 | Added — v2 omitted Jaguar basic |
| `sb_withering_fist` | Withering Fist | `Spiritborn_Centipede_Basic` | 1834471 | Added — v2 omitted Centipede basic |
| `sb_quill_volley` | Quill Volley | `Spiritborn_Eagle_Core` | 1519048 | Category corrected basic→core |
| `sb_crushing_hand` | Crushing Hand | `Spiritborn_Gorilla_Core` | 1519050 | Category corrected brawling→core |
| `sb_rake` | Rake | `Spiritborn_Jaguar_Core` | 1640931 | Category corrected basic→core |
| `sb_stinger` | Stinger | `Spiritborn_Centipede_Core` | 1836008 | Direct match; tPrimaryTag = core |
| `sb_razor_wings` | Razor Wings | `Spiritborn_Eagle_Potency1` | 1871807 | Category corrected defensive→potency |
| `sb_payback` | Payback | `Spiritborn_Gorilla_Potency` | 1871823 | Added — v2 omitted Gorilla potency |
| `sb_rushing_claw` | Rushing Claw | `Spiritborn_Jaguar_Potency` | 1871761 | Added — v2 omitted Jaguar potency |
| `sb_touch_of_death` | Touch of Death | `Spiritborn_Centipede_Potency` | 1871809 | Added — v2 omitted Centipede potency |
| `sb_armored_hide` | Armored Hide | `Spiritborn_Gorilla_Defensive1` | 1871764 | Direct match |
| `sb_concussive_stomp` | Concussive Stomp | `Spiritborn_Gorilla_Defensive2` | 1871825 | Added — v2 omitted second Gorilla defensive |
| `sb_counterattack` | Counterattack | `Spiritborn_Jaguar_Defensive` | 1871819 | Direct match |
| `sb_scourge` | Scourge | `Spiritborn_Centipede_Defensive` | 1871801 | Category corrected core→defensive |
| `sb_vortex` | Vortex | `Spiritborn_Eagle_Focus` | 1489641 | Added — v2 omitted Eagle focus tier |
| `sb_soar` | Soar | `Spiritborn_Eagle_Focus2` | 1871821 | Added — v2 omitted Eagle second focus |
| `sb_ravager` | Ravager | `Spiritborn_Jaguar_Focus` | 1862773 | Added — v2 had fabricated "Ravage"; datamine name is Ravager |
| `sb_toxic_skin` | Toxic Skin | `Spiritborn_Centipede_Focus` | 1871813 | Added — v2 omitted Centipede focus |
| `sb_the_seeker` | The Seeker | `Spiritborn_Eagle_Ultimate` | 1663204 | Category corrected brawling→ultimate |
| `sb_the_protector` | The Protector | `Spiritborn_Gorilla_Ultimate` | 1663208 | Added — v2 omitted Gorilla ultimate |
| `sb_the_hunter` | The Hunter | `Spiritborn_Jaguar_Ultimate` | 1663206 | Added — v2 omitted Jaguar ultimate |
| `sb_the_devourer` | The Devourer | `Spiritborn_Centipede_Ultimate` | 1663210 | Added — v2 omitted Centipede ultimate |
| `sb_vital_strikes` | Vital Strikes | `Spiritborn_Talent_KeyPassive_1` | 1920204 | Added; v2 had "Dominant" (not found in datamine) |
| `sb_prodigys_tempo` | Prodigy's Tempo | `Spiritborn_Talent_KeyPassive_3` | 1920209 | Added; no `KeyPassive_2` file in this build |
| `sb_noxious_resonance` | Noxious Resonance | `Spiritborn_Talent_KeyPassive_4` | 1920211 | Added; v2 had "Resonance" (not found) |
| `sb_adaptive_stances` | Adaptive Stances | `Spiritborn_Talent_KeyPassive_5` | 1955450 | Added; v2 had "Pack Leader" (not found) |

---

## §3 Sorcerer Paragon Boards

Derived from `json/base/meta/ParagonBoard/Paragon_Sorc_NN.pbd.json`. Starter board identified by `legendaryNodeIcon == 0`. Board display names use v2 community labels for boards 00–07; labels for boards 08 and 10 are deferred pending string-table resolution (Decision D11). No `Paragon_Sorc_09.pbd.json` exists in this build — see §7.

| Catalog ID | Label (community) | bnetFileName | bnetId |
|---|---|---|---|
| `sorc_starter` | Starter Board | `Paragon_Sorc_00` | 939773 |
| `sorc_devastation` | Devastation | `Paragon_Sorc_01` | 939563 |
| `sorc_searing_heat` | Searing Heat | `Paragon_Sorc_02` | 939706 |
| `sorc_frigid_fate` | Frigid Fate | `Paragon_Sorc_03` | 939708 |
| `sorc_shocking_strikes` | Shocking Strikes | `Paragon_Sorc_04` | 939747 |
| `sorc_enchantment_mastery` | Enchantment Mastery | `Paragon_Sorc_05` | 993604 |
| `sorc_the_oculus` | The Oculus | `Paragon_Sorc_06` | 997305 |
| `sorc_burning_instinct` | Burning Instinct | `Paragon_Sorc_07` | 1192460 |
| `sorc_board_08` | Board 08 (label deferred) | `Paragon_Sorc_08` | 1192467 |
| `sorc_board_10` | Board 10 (label deferred) | `Paragon_Sorc_10` | 1985929 |

---

## §4 Spiritborn Paragon Boards

Derived from `json/base/meta/ParagonBoard/Paragon_Spirit_N[N].pbd.json`. Note: starter board file is `Paragon_Spirit_0.pbd.json` (single zero, no leading zero) — confirmed by `legendaryNodeIcon == 0`. Board display names use v2 community labels for boards 0–05; labels for boards 06–08 are deferred (Decision D11). No `Paragon_Spirit_09.pbd.json` exists in this build — see §7.

| Catalog ID | Label (community) | bnetFileName | bnetId |
|---|---|---|---|
| `sb_starter` | Starter Board | `Paragon_Spirit_0` | 1985956 |
| `sb_eagle_flight` | Eagle Flight | `Paragon_Spirit_01` | 1985954 |
| `sb_jaguar_pounce` | Jaguar Pounce | `Paragon_Spirit_02` | 1986368 |
| `sb_gorilla_grip` | Gorilla Grip | `Paragon_Spirit_03` | 1986382 |
| `sb_centipede_venom` | Centipede Venom | `Paragon_Spirit_04` | 1986416 |
| `sb_spirit_ascendant` | Spirit Ascendant | `Paragon_Spirit_05` | 1986433 |
| `sb_board_06` | Board 06 (label deferred) | `Paragon_Spirit_06` | 1986521 |
| `sb_board_07` | Board 07 (label deferred) | `Paragon_Spirit_07` | 1986631 |
| `sb_board_08` | Board 08 (label deferred) | `Paragon_Spirit_08` | 1986843 |

---

## §5 Sorcerer Paragon Glyphs

Derived from `json/base/meta/ParagonGlyph/Rare_*.gph.json` filtered by `fUsableByClass[0] == 1` (Sorcerer = index 0). Display names confirmed from `json/enUS_Text/meta/StringList/ParagonGlyph_Rare_<NN>_<stat>_<position>.stl.json`. All 10 v2 glyph entries pass the class filter. Five v2 community labels did not match the datamine string-table display names; labels updated per datamine (analogous to the Warlock "Lava Bomb" correction). The five updated labels are noted below.

| Catalog ID | Label | bnetFileName | bnetId | usable[0] |
|---|---|---|---|---|
| `glyph_reinforced` | Reinforced | `Rare_012_Willpower_Side` | 1023195 | 1 |
| `glyph_flamefeeder` | Flamefeeder | `Rare_015_Dexterity_Side` | 1023198 | 1 |
| `glyph_exploit` | Tactician *(v2: "Exploit")* | `Rare_010_Dexterity_Main` | 1023193 | 1 |
| `glyph_control` | Control | `Rare_020_Dexterity_Side` | 1023203 | 1 |
| `glyph_cold_calc` | Cryopathy *(v2: "Cold Calc")* | `Rare_009_Willpower_Side` | 1023192 | 1 |
| `glyph_destruction` | Destruction | `Rare_019_Dexterity_Side` | 1023202 | 1 |
| `glyph_stalagmite` | Stalagmite | `Rare_084_Intelligence_Main` | 1623724 | 1 |
| `glyph_lesser_conjuration` | Conjurer *(v2: "Lesser Conjuration")* | `Rare_005_Intelligence_Main` | 1023188 | 1 |
| `glyph_esoteric_alteration` | Warding *(v2: "Esoteric Alteration")* | `Rare_077_Willpower_Side` | 1023196 | 1 |
| `glyph_lightning_rod` | Charged *(v2: "Lightning Rod")* | `Rare_006_Intelligence_Main` | 1023189 | 1 |

The 19 Sorcerer-usable glyph files in this build include 9 additional glyphs (Enchanter, Unleash, Elementalist, Adept, Torch, Pyromaniac, Winter, Electrocute, Invocation) not present in the v2 seed. These are deferred to a future catalog expansion.

---

## §6 Spiritborn Paragon Glyphs

Derived from `json/base/meta/ParagonGlyph/Rare_*.gph.json` filtered by `fUsableByClass[5] == 1` (Spiritborn = index 5). Display names confirmed from `json/enUS_Text/meta/StringList/ParagonGlyph_Rare_<NN>_<stat>_<position>.stl.json`.

> **Removed entries** (were in v2 seed; fail `fUsableByClass[5]` filter):
>
> - `glyph_reinforced` ("Reinforced") — `Rare_012_Willpower_Side` has `fUsableByClass[5] == 0`; that file is Sorcerer-exclusive. No Spiritborn-usable "Reinforced" file exists in this build. Removed.
> - `glyph_exploit` ("Exploit") — No Spiritborn-usable glyph with this display name exists. Removed.
> - `glyph_control` ("Control") — `Rare_020_Dexterity_Side` has `fUsableByClass[5] == 0`. No Spiritborn-usable "Control" file found. Removed.
> - `glyph_territorial` ("Territorial") — No matching Spiritborn-usable file found. Removed.
> - `glyph_seeker_g` ("Seeker") — No matching Spiritborn-usable file found. Removed.
> - `glyph_keeper` ("Keeper") — No matching Spiritborn-usable file found. Removed.
>
> All six v2 Spiritborn glyph entries were fabricated; the datamine Spiritborn glyph set is entirely new.

| Catalog ID | Label | bnetFileName | bnetId | usable[5] |
|---|---|---|---|---|
| `glyph_sb_fulminate` | Fulminate | `Rare_047_Intelligence_Side` | 2077016 | 1 |
| `glyph_sb_outmatch` | Outmatch | `Rare_049_Strength_Side` | 2077200 | 1 |
| `glyph_sb_spirit` | Spirit | `Rare_050_Dexterity_Main` | 2077106 | 1 |
| `glyph_sb_menagerist` | Menagerist | `Rare_090_Dexterity_Main` | 2064639 | 1 |
| `glyph_sb_hone` | Hone | `Rare_091_Strength_Side` | 2067363 | 1 |
| `glyph_sb_consumption` | Consumption | `Rare_092_Intelligence_Side` | 2070496 | 1 |
| `glyph_sb_fitness` | Fitness | `Rare_093_Dexterity_Main` | 2063983 | 1 |
| `glyph_sb_ritual` | Ritual | `Rare_094_Intelligence_Side` | 2069914 | 1 |
| `glyph_sb_jagged_plume` | Jagged Plume | `Rare_095_Dexterity_Main` | 2066786 | 1 |
| `glyph_sb_innate` | Innate | `Rare_096_Strength_Side` | 2067561 | 1 |
| `glyph_sb_wildfire` | WildFire | `Rare_097_Dexterity_Main` | 2067631 | 1 |
| `glyph_sb_colossal` | Colossal | `Rare_098_Strength_Side` | 2069252 | 1 |
| `glyph_sb_talon` | Talon | `Rare_100_Dexterity_Main` | 2067375 | 1 |
| `glyph_sb_hubris` | Hubris | `Rare_101_Strength_Side` | 2070631 | 1 |
| `glyph_sb_fester` | Fester | `Rare_102_Dexterity_Main` | 2072563 | 1 |

---

## §7 Open Items

1. **Paragon_Sorc_09 gap** — `Paragon_Sorc_09.pbd.json` does not exist in build 3.0.1.71747. The sequence jumps from `_08` to `_10`. The cause is unknown (development gap or removed board). Boards 08 and 10 are mapped sequentially in the catalog. This is analogous to the `Paragon_Warlock_09` gap documented in `docs/datamine-verification-2026-05-08.md §7`.

2. **Paragon_Spirit_09 gap** — `Paragon_Spirit_09.pbd.json` does not exist in this build. Spiritborn has 9 board files (`_0` through `_08`); a brief expectation of 10 boards was not met by the datamine. Documented as a file-gap; future builds may add this file.

3. **Spiritborn starter board non-standard filename** — `Paragon_Spirit_0.pbd.json` uses a single-digit zero (not `_00`). All other Spiritborn board files use two-digit suffixes (`_01`–`_08`). The `bnetFileName` in the catalog preserves the literal filename `Paragon_Spirit_0` as required by the resolver contract.

4. **Sorcerer paragon board label deferral** — `Paragon_Sorc_08` and `Paragon_Sorc_10` have empty `szName` fields in their `.pbd.json` files. String-table resolution is deferred; catalog currently uses placeholder labels "Board 08 (label deferred)" and "Board 10 (label deferred)".

5. **Spiritborn paragon board label deferral** — `Paragon_Spirit_06`, `_07`, and `_08` have empty `szName` fields. String-table resolution deferred; catalog uses placeholder labels.

6. **Glyph display name deferral (Sorcerer)** — The five Sorcerer glyph label corrections in §5 (Tactician, Cryopathy, Conjurer, Warding, Charged) are confirmed from `ParagonGlyph_*.stl.json` string tables. The mapping of v2 catalog IDs (e.g. `glyph_exploit`) to specific datamine files is a best-effort semantic match; formal verification against in-game UI screenshots is deferred.

7. **Glyph display name deferral (Spiritborn)** — All 15 Spiritborn glyph labels are confirmed from `ParagonGlyph_*.stl.json` string tables and carry no v2 predecessor; formal in-game verification is deferred.

8. **Rare_099 Spiritborn glyph missing** — `Rare_099_*.gph.json` (expected display name "Hubris" per a related string-table file that was found) does not exist in the `ParagonGlyph/` directory under any stat-type suffix in build 3.0.1.71747. The glyph is not cataloged. If a future build adds `Rare_099`, it should be added as `glyph_sb_hubris_rare099` (or similar) with the associated snoID.

9. **Sorcerer key-passive system** — Build 3.0.1.71747 contains 14 Sorcerer passive-talent Power files (Hoarfrost, Frigid Breeze, Elemental Synergies, Energy Focus, etc.) but no Power files for the classic key passives (Shatter, Permafrost, Avalanche, Endless Pyre, Vyr's Mastery, Combustion/Static Discharge). These classic names returned 404 under every naming convention tested. It is likely that the LoH expansion reworked the Sorcerer passive tree, replacing the key-passive selection mechanic with a flat passive-node system. The 14 Talent passive Power files are cataloged separately if needed in a future data type extension.

10. **Spiritborn `KeyPassive_2` gap** — `Spiritborn_Talent_KeyPassive_2.pow.json` does not exist in this build. The sequence is 1, 3, 4, 5 (no 2). The cause is unknown; the catalog reflects only the four existing files.
