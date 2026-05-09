# D4 Datamine Import — Build 3.0.1.71747

**Source:** DiabloTools/d4data  
**Build:** 3.0.1.71747  
**Accessed:** 2026-05-08  
**Status:** Pre-seeding audit (tool not yet run against live datamine)

---

## Context

This document records the pre-seeding catalog state as of build 3.0.1.71747. The import tool
(`tools/datamine-import/`) was implemented in this commission but has not yet been executed against
a local clone of `DiabloTools/d4data`, because the datamine is not bundled with the repository.
The catalog files in `lib/catalog/` reflect the state before the tool's first run.

To produce the real seeding audit after cloning the datamine:

```bash
git clone https://github.com/DiabloTools/d4data.git /path/to/d4data
pnpm import:datamine \
  --build 3.0.1.71747 \
  --datamine /path/to/d4data \
  --accessed-date 2026-05-08
```

The tool will overwrite this file with the live results and update `lib/catalog/*.json`.

---

## Current Catalog State (Pre-Seeding)

### Skills and Paragon

Skills and paragon data were datamine-verified in the v6–v9 manual audit passes
(`docs/datamine-verification-*.md`). The catalog JSON files carry `verifiedAgainst.patch:
"3.0.1.71747"` with full `bnetId` and `bnetFileName` audit trails. The import tool's `curation.json`
has been populated with all 202 skill entries and 72 paragon board entries and 106 glyph entries
to ensure re-runs produce zero diff against the current catalog state (idempotency).

| Class | Skills | Boards | Glyphs |
|-------|--------|--------|--------|
| Barbarian | 23 | 10 | 23 |
| Druid | 26 | 10 | 23 |
| Necromancer | 25 | 7 | 6 |
| Paladin | 24 | 10 | 13 |
| Rogue | 27 | 6 | 6 |
| Sorcerer | 25 | 10 | 10 |
| Spiritborn | 28 | 9 | 15 |
| Warlock | 24 | 10 | 10 |
| **Total** | **202** | **72** | **106** |

### Affixes

43 hand-curated entries in `lib/catalog/affixes.json`. These entries carry no `bnetId` or
`bnetFileName` since they predate the import pipeline. The first real tool run against
`DiabloTools/d4data` will expand this to the full live-game affix pool (200+ entries) and populate
`bnetId` / `bnetFileName` on every entry. The `verifiedAgainst.patch` field is currently
`"unconfirmed"`.

**Action required on first tool run:** Every affix in the datamine that doesn't match a curation
record will surface as `needs-curation`. The user must add entries to `curation.json` (or rely on
auto-accept for clean non-WIP affixes) and re-run until exit code 0.

### Aspects

20 hand-curated codex aspects in `lib/catalog/aspects.json`. All carry `source: "codex"` but no
`bnetId` or `bnetFileName`. The `curation.json` has been populated with entries for all 20 aspects
using inferred bnetFileNames based on the datamine's Power file naming convention
(e.g. `Aspect_Disobedience`, `Aspect_Might`). The `source: "codex"` override is set in each
curation record so the source classification is preserved across reruns.

> **Note:** The bnetFilenames in `curation.json` for aspects are inferred, not verified against the
> live datamine. On the first real tool run, any aspect whose curation key doesn't match a Power file
> will surface as `needs-curation`. Update the keys to the actual filenames shown in the audit doc
> and re-run.

### Uniques

`lib/catalog/uniques.json` contains 0 entries (empty placeholder). The import tool will populate
this on first run from UNIQUE and MYTHIC item types in the datamine.

---

## Curation Summary

`tools/datamine-import/curation.json` has been seeded with:

| Section | Entries |
|---------|---------|
| `affixes` | 3 (test examples; real affix bnetFilenames require first datamine run) |
| `aspects` | 20 (all existing codex aspects with inferred bnetFilenames + source overrides) |
| `skills` | 202 (all 8 classes, verified bnetFilenames from v6–v9 audit) |
| `paragonBoards` | 72 (all 8 classes, verified bnetFilenames from v6–v9 audit) |
| `paragonGlyphs` | 106 (all 8 classes, verified bnetFilenames from v6–v9 audit) |
| `uniques` | 0 (empty; populated on first datamine run) |

---

## Internal Name Divergences Recorded

The following datamine bnetFilenames diverge from their live display names. These are captured in
`curation.json` with explicit `catalogId` and `label` overrides:

| bnetFileName | Live Display Name | Notes |
|---|---|---|
| `Barbarian_Maim` | Flay | Renamed from Maim to Flay |
| `X1_Barbarian_WeaponThrow` | Mighty Throw | X1 prefix = DLC-era addition |
| `Druid_Earthspike_Instant` | Earth Spike | Instant suffix dropped |
| `Druid_landslide` | Landslide | Lowercase L in datamine |
| `Druid_Shred_NEW` | Shred | _NEW suffix on reworked skill |
| `Druid_WolfPack` | Wolves | Display name simplified |
| `Paladin_StormBolt` | Holy Bolt | Pre-release name divergence |
| `Paladin_Punish` | Clash | Renamed |
| `Paladin_PreTrailZeal` | Zeal | Pre-trail internal name |
| `Paladin_Impale` | Divine Lance | Pre-release name |
| `Paladin_Offensive_Aura` | Fanaticism Aura | Aura type encoded in filename |
| `Paladin_Defensive_Aura` | Defiance Aura | Aura type encoded in filename |
| `Paladin_HolyShock_Aura` | Holy Light Aura | Aura type encoded in filename |
| `Paladin_LanceDive_OLD` | Falling Star | _OLD suffix (live skill, not deprecated) |
| `Paladin_Sacrifice` | Rally | Renamed |
| `Paladin_Smite_FalconPunch_Recast_1` | Aegis | Complex internal name |
| `Paladin_Trinity` | Zenith | Renamed |
| `Paladin_Disciple_of_Justice` | Arbiter of Justice | Renamed |
| `X1_Sorcerer_Familiar` | Familiar | X1 prefix = DLC-era addition |
| `Sorcerer_ChargedBolt` | Charged Bolts | Plural in display name |
| `Warlock_Summon_Lunatic` | Command Fallen | Renamed from summoning mechanic |
| `Warlock_BrimstoneOrb` | Lava Bomb | Pre-release name was Molten Bomb; further renamed |
| `Warlock_HexCast` | Doom | Renamed |
| `Warlock_TailWhip` | Hellion Sting | Renamed |
| `Warlock_BurningSkull` | Blazing Scream | Renamed |
| `Warlock_DemonicBombard` | Bombardment | Simplified |
| `Warlock_ChainLash` | Umbral Chains | Renamed |
| `Warlock_ShadowShred` | Dread Claws | Renamed |
| `Warlock_Fissure` | Hell Fracture | Renamed |
| `Warlock_WraithStep` | Nether Step | Renamed |
| `Warlock_ChainTotem` | Dark Prison | Renamed |
| `Warlock_Demon_Wall` | Wall of Agony | Renamed |
| `Warlock_DemonDefender` | Tortured Wretch | Renamed |
| `Warlock_Demonic_Breath` | Infernal Breath | Renamed |
| `Warlock_Demonic_Drain` | Profane Sentinel | Renamed |
| `Warlock_DemonicSlash` | Rampage | Renamed |
| `Warlock_DemonicGrasp` | Tyrant's Grasp | Renamed |
| `Warlock_SigilOfFlames` | Sigil of Chaos | Renamed |
| `Warlock_SigilOfShadows` | Sigil of Subversion | Renamed |
| `Warlock_UltimateDemon` | Fiend of Abaddon | Renamed |
| `Warlock_HellStorm` | Terror Swarm | Renamed |
| `Warlock_Doombringer` | Apocalypse | Renamed |
| `Warlock_ArchDemon` | Metamorphosis | Renamed |

---

## Open Items

1. **Run the tool against `DiabloTools/d4data`** to produce the real seeding output for affixes,
   aspects, and uniques. This will replace this file with a live audit document.

2. **Verify aspect bnetFilenames.** The 20 aspect curation entries use inferred bnetFilenames.
   The first real run will surface mismatches as `needs-curation`; update `curation.json` and re-run.

3. **Curate the full affix pool.** The 43 existing hand-curated affixes have no datamine bnetFilenames.
   The first real run will produce the full live affix list; each entry needs an `include` or `exclude`
   decision in `curation.json` (auto-accept applies to clean non-WIP affixes with valid labels).

4. **Unique items.** The first real run will surface all UNIQUE/MYTHIC items from the datamine.
   Each needs a curation decision before it appears in the catalog.
