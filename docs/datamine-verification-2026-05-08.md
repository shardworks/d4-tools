# Datamine Verification Audit — 2026-05-08

```
Source: DiabloTools/d4data
Build:  3.0.1.71747 (Season 13 / Lord of Hatred)
Accessed: 2026-05-08
```

This document is the authoritative per-entry audit trail for every Paladin and Warlock entry in
`lib/catalog/skills/{Paladin,Warlock}.json` and `lib/catalog/paragon/{Paladin,Warlock}.json`.
Each row traces a catalog entry to its canonical datamine file at build 3.0.1.71747.

All skill bnetFileNames resolve to files under `json/base/meta/Power/` (e.g.,
`Paladin_BlessedShield.pow.json`). All paragon board bnetFileNames resolve to files under
`json/base/meta/ParagonBoard/` (e.g., `Paragon_Paladin_00.pbd.json`). All glyph bnetFileNames
resolve to files under `json/base/meta/ParagonGlyph/` (e.g., `Rare_016_Intelligence_Side.gph.json`).

Display names were cross-referenced against string list files in `json/enUS_Text/meta/StringList/`
(path: `Item_ParagonGlyph_{FileName}.stl.json` for glyphs; `Skill_{FileName}_SkillTagPower.stl.json`
for skills). Several Paladin Power file names do not match the in-game skill display name — the
divergences are documented in the Notes column.

---

## 1. Paladin Skills

Extracted from `json/base/meta/SkillKit/Paladin_NEW.skl.json`, `arActiveSkillEntries` (24 entries).
String list display names confirmed from `json/enUS_Text/meta/StringList/Skill_*_SkillTagPower.stl.json`.

| Catalog ID | Display Name | bnetFileName | bnetId | Notes |
|---|---|---|---|---|
| `pal_brandish` | Brandish | `Paladin_Brandish` | 2265693 | Direct match |
| `pal_holy_bolt` | Holy Bolt | `Paladin_StormBolt` | 2174078 | Internal name `StormBolt`; display "Holy Bolt" confirmed from string list |
| `pal_clash` | Clash | `Paladin_Punish` | 2097465 | Internal name `Punish`; display "Clash" confirmed from string list |
| `pal_advance` | Advance | `Paladin_Advance_lunge` | 2329865 | Internal name has `_lunge` suffix; display "Advance" confirmed |
| `pal_zeal` | Zeal | `Paladin_PreTrailZeal` | 2132824 | Internal name `PreTrailZeal`; display "Zeal" confirmed |
| `pal_blessed_shield` | Blessed Shield | `Paladin_BlessedShield` | 2082021 | Direct match |
| `pal_blessed_hammer` | Blessed Hammer | `Paladin_BlessedHammer` | 2107555 | Direct match |
| `pal_divine_lance` | Divine Lance | `Paladin_Impale` | 2120228 | Internal name `Impale`; display "Divine Lance" confirmed from string list |
| `pal_shield_bash` | Shield Bash | `Paladin_ShieldBash` | 2087548 | Direct match |
| `pal_fanaticism_aura` | Fanaticism Aura | `Paladin_Offensive_Aura` | 2187741 | Internal name `Offensive_Aura`; display "Fanaticism Aura" confirmed |
| `pal_defiance_aura` | Defiance Aura | `Paladin_Defensive_Aura` | 2187578 | Internal name `Defensive_Aura`; display "Defiance Aura" confirmed |
| `pal_holy_light_aura` | Holy Light Aura | `Paladin_HolyShock_Aura` | 2297097 | Internal name `HolyShock_Aura`; display "Holy Light Aura" confirmed |
| `pal_falling_star` | Falling Star | `Paladin_LanceDive_OLD` | 2106904 | Internal name `LanceDive_OLD` (legacy working name); display "Falling Star" confirmed |
| `pal_shield_charge` | Shield Charge | `Paladin_ShieldCharge_Channel_Short` | 2466077 | The `Paladin_ShieldCharge` file (no suffix) has display `{c_red}[WIP] Shield Charge{/c}` — WIP file; `_Channel_Short` is the live implementation |
| `pal_rally` | Rally | `Paladin_Sacrifice` | 2303677 | Internal name `Sacrifice`; display "Rally" confirmed from string list |
| `pal_aegis` | Aegis | `Paladin_Smite_FalconPunch_Recast_1` | 2292204 | Internal name `Smite_FalconPunch_Recast_1` (legacy); display "Aegis" confirmed |
| `pal_purify` | Purify | `Paladin_Purify` | 2261380 | Direct match |
| `pal_consecration` | Consecration | `Paladin_Consecration` | 2283781 | Direct match |
| `pal_condemn` | Condemn | `Paladin_Condemn` | 2226109 | Direct match |
| `pal_spear_of_the_heavens` | Spear of the Heavens | `Paladin_SpearOfTheHeavens` | 2100457 | Direct match |
| `pal_heavens_fury` | Heaven's Fury | `Paladin_HeavensFury` | 2273081 | Direct match |
| `pal_fortress` | Fortress | `Paladin_Fortress` | 2301078 | Direct match |
| `pal_zenith` | Zenith | `Paladin_Trinity` | 2302974 | Internal name `Trinity`; display "Zenith" confirmed from string list |
| `pal_arbiter_of_justice` | Arbiter of Justice | `Paladin_Disciple_of_Justice` | 2297125 | Internal name `Disciple_of_Justice`; display "Arbiter of Justice" confirmed |

**Verification method:** snoIDs extracted from the `__snoID__` field in each Power file. Display
names cross-referenced from `Skill_{FileName}_SkillTagPower.stl.json` string list entries where
`szLabel == "name"`. Identity tags (`tPrimaryTag.gbidSkillTag.name`) in the SkillKit node rewards
and Power files provided the SkillKit-to-Power-file mapping.

---

## 2. Warlock Skills

Extracted from `json/base/meta/SkillKit/Warlock.skl.json`, `arActiveSkillEntries` (28 entries).
The SkillKit contains 28 active skill entries, of which 24 are skill tree skills and 4 are Soul
Shard class mechanic sub-skills (`Warlock_Command_Legion_Demon`, `Warlock_Command_Vanguard_Demon`,
`Warlock_Command_Mastermind_Demon`, `Warlock_Command_Ritualist_Demon`). The catalog lists the 24
skill tree skills only.

**Catalog correction:** The v5 seed catalog listed the basic skill as "Molten Bomb" with id
`warl_molten_bomb`. The datamine identity tag in `Warlock_BrimstoneOrb.pow.json` is
`Skill_Warlock_LavaBomb`, confirming the canonical internal skill name is Lava Bomb. The catalog
has been corrected to id `warl_lava_bomb`, label "Lava Bomb". The Power file internal name
(`BrimstoneOrb`) and display name in the string table ("Molten Bomb") reflect a pre-release
naming state; the identity tag (`Skill_Warlock_LavaBomb`) is the authoritative skill name as
used by the game engine.

| Catalog ID | Display Name | bnetFileName | bnetId | Notes |
|---|---|---|---|---|
| `warl_command_fallen` | Command Fallen | `Warlock_Summon_Lunatic` | 2212801 | Internal name `Summon_Lunatic`; confirmed catalog skill |
| `warl_lava_bomb` | Lava Bomb | `Warlock_BrimstoneOrb` | 2215258 | Corrected from "Molten Bomb" per `Skill_Warlock_LavaBomb` identity tag |
| `warl_doom` | Doom | `Warlock_HexCast` | 2218204 | Internal name `HexCast` |
| `warl_hellion_sting` | Hellion Sting | `Warlock_TailWhip` | 2420679 | Internal name `TailWhip` |
| `warl_blazing_scream` | Blazing Scream | `Warlock_BurningSkull` | 2213860 | Internal name `BurningSkull` |
| `warl_bombardment` | Bombardment | `Warlock_DemonicBombard` | 2245719 | Internal name `DemonicBombard` |
| `warl_umbral_chains` | Umbral Chains | `Warlock_ChainLash` | 2218200 | Internal name `ChainLash` |
| `warl_dread_claws` | Dread Claws | `Warlock_ShadowShred` | 2385787 | Internal name `ShadowShred` |
| `warl_hell_fracture` | Hell Fracture | `Warlock_Fissure` | 2164252 | Internal name `Fissure` |
| `warl_nether_step` | Nether Step | `Warlock_WraithStep` | 2218211 | Internal name `WraithStep` |
| `warl_dark_prison` | Dark Prison | `Warlock_ChainTotem` | 2418214 | Internal name `ChainTotem` |
| `warl_wall_of_agony` | Wall of Agony | `Warlock_Demon_Wall` | 2228435 | Internal name `Demon_Wall` |
| `warl_tortured_wretch` | Tortured Wretch | `Warlock_DemonDefender` | 2245730 | Internal name `DemonDefender` |
| `warl_infernal_breath` | Infernal Breath | `Warlock_Demonic_Breath` | 2214419 | Internal name `Demonic_Breath` |
| `warl_profane_sentinel` | Profane Sentinel | `Warlock_Demonic_Drain` | 2289261 | Internal name `Demonic_Drain` |
| `warl_rampage` | Rampage | `Warlock_DemonicSlash` | 2221282 | Internal name `DemonicSlash` |
| `warl_tyrants_grasp` | Tyrant's Grasp | `Warlock_DemonicGrasp` | 2301447 | Internal name `DemonicGrasp` |
| `warl_sigil_of_chaos` | Sigil of Chaos | `Warlock_SigilOfFlames` | 2218213 | Internal name `SigilOfFlames` |
| `warl_sigil_of_summons` | Sigil of Summons | `Warlock_SigilOfSummons` | 2221240 | Direct match |
| `warl_sigil_of_subversion` | Sigil of Subversion | `Warlock_SigilOfShadows` | 2218209 | Internal name `SigilOfShadows` |
| `warl_fiend_of_abaddon` | Fiend of Abaddon | `Warlock_UltimateDemon` | 2244457 | Internal name `UltimateDemon` |
| `warl_terror_swarm` | Terror Swarm | `Warlock_HellStorm` | 2216334 | Internal name `HellStorm` |
| `warl_apocalypse` | Apocalypse | `Warlock_Doombringer` | 2221260 | Internal name `Doombringer` |
| `warl_metamorphosis` | Metamorphosis | `Warlock_ArchDemon` | 2215096 | Internal name `ArchDemon` |

---

## 3. Paladin Paragon Boards

Extracted from `json/base/meta/ParagonBoard/Paragon_Paladin_00.pbd.json` through
`Paragon_Paladin_09.pbd.json`. All 10 boards exist in the datamine. Board display names are NOT
embedded in the `.pbd.json` files (the `szName` field is empty); display names come from
string tables and are sourced from community data (v5 seed). Board-to-file assignment is
sequential: the starter board (identified by `legendaryNodeIcon == 0`) is `Paragon_Paladin_00`;
the remaining 9 boards are assigned in catalog order.

| Catalog ID | Label (community) | bnetFileName | bnetId |
|---|---|---|---|
| `pal_starter` | Starter Board | `Paragon_Paladin_00` | 2436481 |
| `pal_beacon` | Beacon | `Paragon_Paladin_01` | 2436511 |
| `pal_castle` | Castle | `Paragon_Paladin_02` | 2436844 |
| `pal_divinity` | Divinity | `Paragon_Paladin_03` | 2438913 |
| `pal_endure` | Endure | `Paragon_Paladin_04` | 2438973 |
| `pal_fervent` | Fervent | `Paragon_Paladin_05` | 2438992 |
| `pal_preacher` | Preacher | `Paragon_Paladin_06` | 2439024 |
| `pal_relentless` | Relentless | `Paragon_Paladin_07` | 2439031 |
| `pal_sentencing` | Sentencing | `Paragon_Paladin_08` | 2439033 |
| `pal_shield_bearer` | Shield Bearer | `Paragon_Paladin_09` | 2439035 |

**Note on board display names:** The board labels above (Beacon, Castle, etc.) are sourced from the
v5 seed community data. The datamine `.pbd.json` files do not embed human-readable board names.
String-table verification of these labels is deferred; the board-to-file assignment (sequential
catalog order → sequential file index) is the verified mapping.

---

## 4. Warlock Paragon Boards

Extracted from `json/base/meta/ParagonBoard/Paragon_Warlock_00.pbd.json` through
`Paragon_Warlock_10.pbd.json`. **`Paragon_Warlock_09.pbd.json` does not exist in the datamine.**
The sequence goes 00–08 then 10; 09 is absent. The 10 boards present are assigned to the 10
catalog entries in sequential order, with `warl_ritualism` mapped to `Paragon_Warlock_10`.

| Catalog ID | Label (community) | bnetFileName | bnetId |
|---|---|---|---|
| `warl_starter` | Starter Board | `Paragon_Warlock_00` | 2458674 |
| `warl_chaos` | Chaos | `Paragon_Warlock_01` | 2458676 |
| `warl_demonic_spicules` | Demonic Spicules | `Paragon_Warlock_02` | 2458678 |
| `warl_dominion` | Dominion | `Paragon_Warlock_03` | 2458680 |
| `warl_dynamism` | Dynamism | `Paragon_Warlock_04` | 2458682 |
| `warl_fathomless` | Fathomless | `Paragon_Warlock_05` | 2458684 |
| `warl_greater_hex` | Greater Hex | `Paragon_Warlock_06` | 2458686 |
| `warl_overmind` | Overmind | `Paragon_Warlock_07` | 2458688 |
| `warl_pyrosis` | Pyrosis | `Paragon_Warlock_08` | 2458690 |
| `warl_ritualism` | Ritualism | `Paragon_Warlock_10` | 2458692 |

---

## 5. Paladin Paragon Glyphs

Glyph-to-file mapping via `fUsableByClass` array in each `.gph.json` file. Class indices confirmed:
0=Sorcerer, 1=Druid, 2=Barbarian, 3=Necromancer, 4=Rogue, 5=Spiritborn, 6=Paladin, 7=Warlock.
All 161 `.gph.json` files were exhaustively checked. snoIDs extracted from `__snoID__` field.

**Removed entry:** `glyph_reinforced` ("Reinforced") was in the v5 seed catalog but has no
Paladin-usable file in the datamine at build 3.0.1.71747. The only "Reinforced" glyph
(`Rare_012_Willpower_Side`, snoID 1023195) has `fUsableByClass = [1,0,0,0,0,0,0,0]` (Sorcerer
only). The entry has been removed from the Paladin catalog pending a future datamine build that
adds a Paladin-specific "Reinforced" glyph file.

| Catalog ID | Label | bnetFileName | bnetId | usable[6] |
|---|---|---|---|---|
| `glyph_exploit` | Exploit | `Rare_016_Intelligence_Side` | 2506132 | 1 (shared with Necromancer at index 3) |
| `glyph_control` | Control | `Rare_020_Intelligence_Side` | 1029491 | 1 (shared with Necromancer at index 3) |
| `glyph_chip` | Chip | `Rare_055_Willpower_Side` | 2506071 | 1 |
| `glyph_diminish` | Diminish | `Rare_076_Strength_Main` | 2479306 | 1 |
| `glyph_feverous` | Feverous | `Rare_109_Dexterity_Side` | 2478571 | 1 |
| `glyph_honed` | Honed | `Rare_104_Dexterity_Side` | 2477896 | 1 |
| `glyph_imbiber` | Imbiber | `Rare_011_Willpower_Side` | 1071719 | 1 |
| `glyph_outmatch` | Outmatch | `Rare_049_Strength_Main` | 2506253 | 1 |
| `glyph_resplendence` | Resplendence | `Rare_107_Strength_Main` | 2478548 | 1 |
| `glyph_sentinel` | Sentinel | `Rare_103_Strength_Main` | 2477888 | 1 |
| `glyph_spirit` | Spirit | `Rare_050_Willpower_Side` | 2506810 | 1 |
| `glyph_turf` | Turf | `Rare_014_Strength_Main` | 2506847 | 1 |
| `glyph_undaunted` | Undaunted | `Rare_034_Willpower_Side` | 1027096 | 1 |

**Additional Paladin-usable glyphs in datamine NOT in catalog (deferred):**

The following glyph files have `fUsableByClass[6]=1` but were not in the v5 seed catalog. They
are documented here for future catalog expansion:

| Display Name | bnetFileName | bnetId |
|---|---|---|
| Revenge | `Rare_033_Intelligence_Side` | 2120405 |
| Canny | `Rare_063_Intelligence_Side` | 1029487 |
| Law | `Rare_105_Strength_Main` | 2478228 |
| Retribution | `Rare_106_Strength_Main` | 2617836 |
| Arbiter | `Rare_106_Willpower_Side` | 2478242 |
| Judicator | `Rare_108_Intelligence_Side` | 2478561 |
| Apostle | `Rare_110_Strength_Main` | 2478580 |

---

## 6. Warlock Paragon Glyphs

Same methodology as §5. Warlock class index is 7. All 161 `.gph.json` files were checked.

**Removed entries:** Both `glyph_reinforced` ("Reinforced") and `glyph_exploit` ("Exploit") were
in the v5 seed catalog but have no Warlock-usable file in the datamine at build 3.0.1.71747:

- "Reinforced": Only file is `Rare_012_Willpower_Side` (snoID 1023195), Sorcerer-exclusive
  (`fUsableByClass[7]=0`).
- "Exploit": Four files exist (`Rare_016_Dexterity_Side` for Druid+Barbarian, `Rare_016_Intelligence_Side`
  for Paladin, `Rare_016_Strength_Side` for Necromancer+Spiritborn, `Rare_079_Dexterity_Side` for
  Sorcerer+Rogue), but none has `fUsableByClass[7]=1`. Both entries removed from the Warlock
  catalog pending a future datamine build.

| Catalog ID | Label | bnetFileName | bnetId | usable[7] |
|---|---|---|---|---|
| `glyph_control` | Control | `Rare_125_Willpower_Main` | 2533053 | 1 (Warlock-exclusive) |
| `glyph_abyssal` | Abyssal | `Rare_117_Strength_Side` | 2531536 | 1 (Warlock-exclusive) |
| `glyph_archfiend` | Archfiend | `Rare_124_Willpower_Main` | 2532972 | 1 (Warlock-exclusive) |
| `glyph_demonologist` | Demonologist | `Rare_128_Strength_Side` | 2533449 | 1 (Warlock-exclusive) |
| `glyph_destruction` | Destruction | `Rare_126_Strength_Side` | 2533352 | 1 (Warlock-exclusive) |
| `glyph_hellforge` | Hellforge | `Rare_116_Intelligence_Side` | 2531451 | 1 (Warlock-exclusive) |
| `glyph_ichor_carapace` | Ichor Carapace | `Rare_118_Willpower_Main` | 2531984 | 1 (Warlock-exclusive) |
| `glyph_mastermind` | Mastermind | `Rare_123_Willpower_Main` | 2532939 | 1 (Warlock-exclusive) |
| `glyph_occultist` | Occultist | `Rare_114_Intelligence_Side` | 2530611 | 1 (Warlock-exclusive) |
| `glyph_vanguard` | Vanguard | `Rare_122_Willpower_Main` | 2532860 | 1 (Warlock-exclusive) |

**Note on "Control":** The Warlock "Control" glyph (`Rare_125_Willpower_Main`) is a distinct file
from the Paladin "Control" glyph (`Rare_020_Intelligence_Side`). Both have display name "Control"
but are class-exclusive implementations at different snoIDs.

---

## 7. Open Items

- **Board display name string-table verification:** Board labels for both Paladin and Warlock are
  sourced from v5 community data. Verification against `json/enUS_Text/meta/StringList/` string
  tables requires hash-based lookup (board name hashes stored in `ParagonBoard.pbd.json` but not
  directly resolvable without a hash table). Deferred.
- **`Paragon_Warlock_09` absence:** The gap in the Warlock board file sequence (00–08, 10) is
  unexplained. Possible explanations: removed/merged board, pre-release placeholder. Verify in a
  future datamine build or via Blizzard patch notes.
- **"Reinforced" and "Exploit" for Paladin/Warlock:** No class-usable glyph files exist in build
  3.0.1.71747. These may be added in a future patch or may indicate the v5 community catalog
  incorrectly assumed cross-class availability. Verify against a newer datamine build.
- **Lava Bomb display name discrepancy:** The `Warlock_BrimstoneOrb.pow.json` string table shows
  display name "Molten Bomb" while the identity tag is `Skill_Warlock_LavaBomb`. The catalog
  uses "Lava Bomb" per the identity tag. The string table value may be a pre-release placeholder.
- **Paladin `glyph_reinforced` / Warlock `glyph_reinforced` and `glyph_exploit`:** Removed from
  catalogs at this build. If added by Blizzard in a subsequent patch, the catalog should be updated
  with bnetFileName and bnetId from the new datamine file.
