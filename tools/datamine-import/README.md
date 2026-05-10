# Datamine Import Tool

Idempotent, rerunnable import pipeline that consumes a local clone of the
[DiabloTools/d4data](https://github.com/DiabloTools/d4data) datamine and
regenerates the project's `lib/catalog/*.json` files.

## Prerequisites

Clone the upstream datamine:

```bash
git clone https://github.com/DiabloTools/d4data.git /path/to/d4data
```

## Run Command

```bash
pnpm import:datamine \
  --build 3.0.1.71747 \
  --datamine /path/to/d4data \
  [--accessed-date 2026-05-09] \
  [--dry-run]
```

### Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--build <version>` | Yes | Datamine build version string (e.g. `3.0.1.71747`) |
| `--datamine <path>` | Yes | Path to the local DiabloTools/d4data clone |
| `--accessed-date YYYY-MM-DD` | No | Override the accessed date in catalog stamps (defaults to today UTC) |
| `--dry-run` | No | Parse and compute diffs without writing catalog files |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success — all entries curated, catalog regenerated |
| 1 | Needs curation — one or more entries need editorial decisions in `curation.json` |
| 2 | Parse error / malformed input or missing required flags |

### Catalog writes on exit code 1

When the exit code is 1 (needs-curation), **catalog files are not written**. This is intentional: writing a partial catalog would silently shrink the existing data on every run until all entries are resolved, which is worse than leaving the catalog at its prior state. The audit doc is always written so the user can see which entries need decisions without re-running the tool.

To unblock writes: open `tools/datamine-import/curation.json`, add `include`, `exclude`, or `deprecated` actions for every entry listed in the "Needs Curation" section of the latest `docs/datamine-import-*.md`, and re-run the tool.

## Audit Output

Each run produces `docs/datamine-import-{build}.md` (e.g. `docs/datamine-import-3.0.1.71747.md`).
This file lists every imported entry, excluded entries, and needs-curation entries with reasons.

## Patch Update Workflow

1. **Clone/fetch** the latest datamine: `git pull` in your d4data clone
2. **Pin the build** — check the latest commit or `patch` field in a known JSON file
3. **Dry run**: `pnpm import:datamine --build <new-ver> --datamine <path> --dry-run`
4. **Triage curation**: open `tools/datamine-import/curation.json` and add decisions for any needs-curation entries shown in the audit doc
5. **Real run**: `pnpm import:datamine --build <new-ver> --datamine <path>`
6. **Verify**: `pnpm test` and `pnpm typecheck` pass; `git diff lib/catalog/skills/ lib/catalog/paragon/` is empty (unless skills/paragon changed upstream)
7. **Commit**: stage all changes to `lib/catalog/`, `docs/datamine-import-*.md`, and `tools/datamine-import/curation.json`

## Curation File

`tools/datamine-import/curation.json` is the editorial override file. Structure:

```json
{
  "affixes": {
    "Affix_Str_AddLifePercent": {
      "action": "include",
      "catalogId": "affix_max_life_pct",
      "label": "Maximum Life %",
      "reason": "Hand-seed entry"
    }
  },
  "aspects": {},
  "skills": {},
  "paragonBoards": {},
  "paragonGlyphs": {},
  "uniques": {}
}
```

### Action Values

- `include` — include in catalog (with optional `catalogId` and `label` overrides)
- `exclude` — omit from catalog entirely
- `deprecated` — keep in catalog with `deprecated: true` flag

## v15: Damage Engine Fields

The v15 commission added extraction of damage-engine fields from the datamine:

### Affix `attribute` field

Each affix file's first `ptItemAffixAttributes` entry is extracted as `attribute: { eAttribute, nParam }`.
The damage engine uses `eAttribute` to route the affix contribution into the correct bucket via
`lib/damage/config.json → attributeToBucket`. Multi-attribute affixes use the first attribute only.

### Aspect `attribute` and `isDistinctMultiplier` fields

Aspects extract an optional `attribute` from `ptItemAffixAttributes` (same as affixes). The
`isDistinctMultiplier` flag comes from the curation record and marks `[×]`-tagged aspects as
distinct multiplicative sources in the damage engine.

### Unique `intrinsicAffixes` field

Unique items extract `intrinsicAffixes` from `ptItemAffixAttributes` — the item's power-based
affix attributes with their value ranges. These are the intrinsic bonuses unique to that item.

### Skill `scalingAttributes`, `tags`, `resourceCostPerCast`, `cooldownSeconds`

The skill transformer (`sections/skills.ts`) dereferences each skill's Power file to extract:
- `arScalingAttributes` → `scalingAttributes` (damage coefficients per rank)
- `arTagsGranted` → `tags` (skill type tags)
- `fResourceCost` → `resourceCostPerCast`
- `fCooldownDuration` → `cooldownSeconds`

The Power file is looked up by `tPower.__fileName__` in the powers map built from all
`Power/*.pow.json` files in the datamine. Skills whose Power file cannot be found emit a warning
and continue with no scaling attributes.

---

## Multi-Value Affixes

Some affixes carry two independent value ranges in the datamine (e.g. a label like `[{VALUE:1}]%–[{VALUE:2}]% Bonus Damage`). These are affixes where the stat has both a minimum roll and a maximum roll expressed as separate datamine attributes, rather than the tool's usual single `[min, max]` value range.

**Chosen approach:** Multi-value affixes are flagged as `needs-curation` and excluded from catalog output until a human adds a curation record. The curation record must supply an explicit `catalogId` and `label`; the tool uses the first attribute's value range as the `valueRange` pair. This is documented in the curation record's `reason` field (e.g. `"Multi-attribute: using first attribute only per D18"`).

**Rationale:** Silently truncating to the first attribute would produce incorrect value ranges for a class of affixes that the scoring engine needs to handle distinctly. Flagging them forces a human decision rather than publishing bad data.

Multi-value affixes produce a `{value1}` / `{value2}` label template (e.g. `"{value1}%–{value2}% Bonus Damage"`) for display-string round-tripping, even though the catalog's `valueRange` is derived from the first attribute only.

## Internal Name Divergences

Some datamine file names differ from their display names (e.g. `Barbarian_Maim` displays as "Flay", `Paladin_LanceDive_OLD` maps to "Falling Star"). These are documented in the curation file's `reason` field and in the audit doc's internal-name-divergence notes. The `_OLD` suffix normally triggers the strict-heuristic auto-reject (D17d); entries like `Paladin_LanceDive_OLD` require an explicit `action: "include"` curation record with a reason to override the heuristic.

## Curation File — Source Override for Aspects

The `source` field in a curation record overrides the default aspect source (`"legendary"`). Without this override, every re-run would reclassify all aspects as `"legendary"`, violating idempotency for the 20 hand-curated codex aspects that were seeded before the datamine pipeline existed.

```json
"legendary_disobedience": {
  "action": "include",
  "catalogId": "aspect_of_disobedience",
  "label": "Aspect of Disobedience",
  "source": "codex",
  "reason": "Codex aspect; preserve source across reruns"
}
```

**Aspect curation keys are Affix `__fileName__` values** (e.g. `legendary_disobedience`, `legendary_barb_001`). Aspects live in `Affix/*.aff.json` files where `eAffixType === 1` and the filename matches `legendary_*` or `S\d+_legendary_*`. On the first real datamine run, surface the actual file base names from the audit doc and use those as keys in `curation.json`.
