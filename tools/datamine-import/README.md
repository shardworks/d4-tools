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

## Internal Name Divergences

Some datamine file names differ from their display names (e.g. `Barbarian_Maim` displays as "Flay").
These are documented in the curation file's `reason` field and in the audit doc's internal-name-divergence notes.
