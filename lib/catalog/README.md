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
  id: string;             // e.g. "pal_holy_bolt"
  label: string;          // e.g. "Holy Bolt"
  category: string;       // e.g. "basic", "core", "aura", "valor", "justice", "ultimate"
  maxRank: number;        // 5 for most skills, 1 for ultimates
  bnetId?: number;        // datamine snoID
  bnetFileName?: string;  // datamine Power file name without extension

  // v15: damage engine fields (populated from Power file arScalingAttributes)
  scalingAttributes?: SkillScalingAttribute[]; // damage coefficients per rank
  tags?: string[];              // e.g. ["Fire", "Projectile"] from arTagsGranted
  resourceCostPerCast?: number; // from fResourceCost
  cooldownSeconds?: number;     // from fCooldownDuration
}

interface SkillScalingAttribute {
  attribute: string;  // e.g. "Attr_Skill_Damage_Percent"
  scaleValue: number; // base coefficient at rank 1
  rankScale: number;  // additional coefficient per rank beyond rank 1
}
```

All class skill entries carry `bnetId` and `bnetFileName` traceable to
`DiabloTools/d4data` build `3.0.1.71747`. See `docs/datamine-import-3.0.1.71747.md` (generated
by the import tool) for the per-entry audit trail.

`scalingAttributes` is populated when the datamine import can dereference the skill's Power file.
The damage engine uses entries whose `attribute` maps to a damage bucket to classify a skill as
"damaging" and to compute its base damage coefficient at a given rank.

### `AffixEntry`

```typescript
interface AffixEntry {
  id: string;
  label: string;
  labelTemplate: string;
  valueRange: number[];           // [min, max] roll range
  isPercent: boolean;
  slotRestrictions: string[];
  classRestrictions: string[];
  bnetId?: number;
  bnetFileName?: string;
  deprecated?: boolean;

  // v15: damage engine field
  attribute?: { eAttribute: string; nParam: number };

  // v18: position scoping
  isImplicit?: boolean;           // true → implicit affix; absent/false → explicit
}
```

`attribute` is populated from the first `ptItemAffixAttributes` entry in the datamine affix file.
The damage engine uses `eAttribute` to route the affix into the correct damage bucket. Multi-attribute
affixes use the first attribute only per D6 (curation handles edge cases).

`isImplicit` (v18) marks affixes that are implicit — built into the item type and not replaceable
via enchanting. All seven `affix_implicit_*` entries in the catalog carry `isImplicit: true`. The
triage resolver (`lib/triage/resolve.ts`) uses this field to scope candidate pools by position: an
`"implicit"` position call only matches entries where `isImplicit === true`; an `"explicit"` position
call matches all others (where `isImplicit` is `false` or absent). Absence means false — do not
backfill `isImplicit: false` across existing rows.

### `AspectEntry`

```typescript
interface AspectEntry {
  // ... existing fields ...

  // v15: damage engine fields
  attribute?: { eAttribute: string; nParam: number };
  isDistinctMultiplier?: boolean;
}
```

`isDistinctMultiplier` is set via the curation record's `isDistinctMultiplier` field. When `true`,
this aspect is a `[×]`-tagged distinct multiplicative source — the engine multiplies it into its
own independent bucket.

### `UniqueEntry`

```typescript
interface UniqueEntry {
  // ... existing fields ...

  // v15: damage engine fields
  intrinsicAffixes?: Array<{
    attribute: { eAttribute: string; nParam: number };
    valueRange: [number, number];
  }>;

  // v17: intrinsic aspect-like powers (D1)
  intrinsicAspects?: Array<{
    aspectId?: string;       // matching catalog aspect id (if mappable)
    label: string;           // display label for the power
    valueRange: [number, number];
    isPercent: boolean;
    isDistinctMultiplier?: boolean;
  }>;
}
```

`intrinsicAffixes` contains the unique item's power-affix attribute references (from
`ptItemAffixAttributes` in the datamine). The damage engine uses these to compute DPS contributions
from unique item intrinsic powers.

`intrinsicAspects` (v17) carries intrinsic powers that are aspect-shaped rather than
affix-shaped — i.e., powers that grant a legendary-style buff. The triage resolver's
`resolveUnique()` short-circuit (D16) sources these directly from `UniqueEntry` when an item
name normalises to a known unique. `aspectId` is populated when the power maps 1-to-1 to an
existing `AspectEntry`; otherwise `label` provides the display fallback. The `AspectEntry.source`
enum is unchanged at `"legendary" | "codex"` (D18) — unique intrinsic aspects do not introduce
a third source value.

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

| File | Contents | Entry count (v17) |
|------|----------|-------------------|
| `classes.json` | All 8 classes with `resources`, `primaryStat`, `bnetClassName`, `bnetClassId` | 8 |
| `skills/{Class}.json` | Per-class skill list with category, maxRank, bnetId, bnetFileName | varies |
| `paragon/{Class}.json` | Per-class paragon boards and glyphs with bnetId, bnetFileName | varies |
| `slots.json` | Gear slot definitions | 14 |
| `affixes.json` | Affix catalog (all 8 classes, bnetId/bnetFileName coverage) | 200+ |
| `aspects.json` | Aspect catalog (all 8 classes, bnetId/bnetFileName coverage) | 100+ |
| `uniques.json` | Unique item catalog | 50+ |
| `game-math.json` | Skill points, paragon points, item-power thresholds | — |

---

## Data Source

Catalog files are regenerated from **DiabloTools/d4data** at build `3.0.1.71747` using
`tools/datamine-import/`. The import tool is the supported regeneration path — do not edit
catalog JSON files directly. See `tools/datamine-import/README.md` for the patch update workflow
and `docs/data-sources/06-skills.md` for background on skill data sources.
