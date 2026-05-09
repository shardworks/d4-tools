# lib/catalog

D4 game-data catalog, regenerated from the DiabloTools/d4data datamine by `tools/datamine-import/`.
All data is imported as static JSON (TypeScript `resolveJsonModule`) — no runtime filesystem access,
no fetch calls.

---

## Data Model

### `ClassEntry`

```typescript
interface ClassEntry {
  id: string;             // e.g. "Paladin"
  label: string;          // e.g. "Paladin"
  primaryStat: string;    // e.g. "Strength"
  resources?: string[];   // e.g. ["Faith"] or ["Wrath", "Dominance"]
  supported: boolean;
  unsupportedReason?: string;
  bnetClassName?: string; // Blizzard API slug (e.g. "crusader")
  bnetClassId?: number;   // Blizzard API numeric sno ID
}
```

`resources` is the list of named class resources (the "mana equivalent"). Classes with a single
resource (e.g. Barbarian's Fury, Sorcerer's Mana) carry a single-element array. Warlock carries
two (`["Wrath", "Dominance"]`). All eight classes have this field populated as of 2026-05-08.

### `SkillEntry`

```typescript
interface SkillEntry {
  id: string;           // e.g. "pal_holy_bolt"
  label: string;        // e.g. "Holy Bolt"
  category: string;     // e.g. "basic", "core", "aura", "valor", "justice", "ultimate"
  maxRank: number;      // 5 for most skills, 1 for ultimates
  bnetId?: number;      // datamine snoID
  bnetFileName?: string // datamine Power file name without extension
}
```

All class skill entries carry `bnetId` and `bnetFileName` traceable to
`DiabloTools/d4data` build `3.0.1.71747`. See `docs/datamine-import-3.0.1.71747.md` (generated
by the import tool) for the per-entry audit trail.

### `ParagonBoardEntry` / `ParagonGlyphEntry`

Both carry optional `bnetId` and `bnetFileName` fields following the same convention. Board
bnetFileNames follow the pattern `Paragon_{Class}_{NN}` (e.g. `Paragon_Paladin_00`). Glyph
bnetFileNames follow the pattern `Rare_{NNN}_{StatType}_{Slot}` (e.g. `Rare_001_StatType_Main`).

### `verifiedAgainst` stamp

Every JSON catalog file carries a top-level `verifiedAgainst` block:

```json
{
  "expansion": "Lord of Hatred",
  "season": "Season 13 (Season of Reckoning)",
  "patch": "3.0.1.71747",
  "accessedDate": "2026-05-08"
}
```

The patch string matches the DiabloTools/d4data build tag used for datamine verification.

---

## API

### `getSkillsForClass(className: string): SkillEntry[]`

Returns all skills for a given class. Returns `[]` for unknown class names.

### `getParagonCatalogForClass(className: string): { boards: ParagonBoardEntry[]; glyphs: ParagonGlyphEntry[] }`

Returns paragon boards and glyphs for a given class. Returns `{ boards: [], glyphs: [] }` for
unknown class names.

### `getSlotsForClass(className: string): SlotEntry[]`

Returns gear slots relevant to the class. Barbarians get their 4 weapon slots; all other classes
get `weapon` + `offHand`.

### `getAffixesForSlotAndClass(slotId, className): AffixEntry[]`
### `getAspectsForSlotAndClass(slotId, className): AspectEntry[]`

Filter affixes/aspects by slot and class restrictions.

### `getSkillPointsAvailable(level: number): number`
### `getParagonPointsAvailable(paragonLevel: number): number`

Math helpers derived from `game-math.json` constants.

---

## Source Files

| File | Contents |
|------|----------|
| `classes.json` | All 8 classes with `resources`, `primaryStat`, `bnetClassName`, `bnetClassId` |
| `skills/{Class}.json` | Per-class skill list with category, maxRank, bnetId, bnetFileName |
| `paragon/{Class}.json` | Per-class paragon boards and glyphs with bnetId, bnetFileName |
| `slots.json` | Gear slot definitions |
| `affixes.json` | Affix catalog (all 8 classes, bnetId/bnetFileName coverage) |
| `aspects.json` | Aspect catalog (all 8 classes, bnetId/bnetFileName coverage) |
| `uniques.json` | Unique item catalog |
| `game-math.json` | Skill points, paragon points, item-power thresholds |

---

## Data Source

Catalog files are regenerated from **DiabloTools/d4data** at build `3.0.1.71747` using
`tools/datamine-import/`. The import tool is the supported regeneration path — do not edit
catalog JSON files directly. See `tools/datamine-import/README.md` for the patch update workflow
and `docs/data-sources/06-skills.md` for background on skill data sources.
