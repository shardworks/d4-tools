# lib/import — Build Planner Importers

Converts external build-planner references into canonical d4-tools schema shapes
(`Character`, `Build`, `Item`). Currently ships the Maxroll importer; reserved namespace
for future D4Builds and Mobalytics importers.

## Public API

```ts
import { importMaxrollPlanner } from "lib/import";

const result = await importMaxrollPlanner("https://maxroll.gg/d4/planner/abc12345");
// or: bare id, URL with variant hash, build-guide URL

if (result.ok) {
  const { variants } = result;
  // variants[0].character, variants[0].build, variants[0].items, variants[0].report
} else {
  // result.reason: 'not-found' | 'private' | 'patch-mismatch' | 'zero-mapped' | 'network' | 'parse-error'
}
```

Only `importMaxrollPlanner` and the `ImportResult` / `VariantResult` / `ImportReport` /
`UnmappedRef` / `ImportContext` types are exported. Internal helpers (parser, mapper, slot-map,
payload schema) are private to `lib/import/maxroll/`.

## Import Context

```ts
const result = await importMaxrollPlanner(input, {
  fetch: myMockFetch,     // override global fetch (for tests)
  cacheDir: "/tmp/cache", // override data.min cache dir
  now: new Date(),        // override current timestamp
});
```

## Accepted Inputs

| Input shape | Example |
|---|---|
| Bare planner ID | `"abc12345"` |
| Planner URL | `"https://maxroll.gg/d4/planner/abc12345"` |
| Planner URL with variant hash | `"https://maxroll.gg/d4/planner/abc12345#1&equipment"` |
| Build-guide URL | `"https://maxroll.gg/d4/build-guides/ice-shards-sorcerer"` |

## Result Shape

```ts
// Success
{
  ok: true,
  plannerId: string,
  variants: [{
    variantIndex: number,
    variantName?: string,
    character: Omit<Character, "id">,  // ready to POST to /api/characters
    build: Omit<Build, "id" | "characterId">,  // includes importedFrom provenance
    items: Record<string, Item>,
    report: {
      unmappedAffixes: UnmappedRef[],
      unmappedAspects: UnmappedRef[],
      unmappedParagonNodes: UnmappedRef[],
      unmappedGlyphs: UnmappedRef[],
      unmappedSkills: UnmappedRef[],
      versionMismatch?: { catalogPatch, plannerVersion, explicitMappedRatio }
    }
  }]
}

// Failure
{
  ok: false,
  reason: 'not-found' | 'private' | 'patch-mismatch' | 'zero-mapped' | 'network' | 'parse-error',
  message: string,
  details?: unknown
}
```

## Mapping Decisions

- **Join key:** `bnetFileName` exact match — no label-match, attribute-id, or tag fallbacks.
- **Affix routing (D16):** `isImplicit` → `implicits[]`; Maxroll `tempered` flag → `tempered[]`; else → `explicits[]`.
- **Rarity inference (D14):** unique → `'unique'`; has aspect → `'legendary'`; else → `'rare'`.
- **Paragon nodes (D17):** stored verbatim with `mr:` prefix; `spentPoints = nodes.length`.
- **Glyph level (D18):** defaults to `21` when absent.
- **Item power (D13):** left `undefined` when absent.
- **Level (D12):** defaults to `100` when absent.
- **Aspect source (D11):** defaults to `'legendary'`.
- **Patch-mismatch (D9):** explicit-mapping rate < 50% with differing patch → `ok: false, reason: 'patch-mismatch'`.

## Cache

`data.min.json` (~11 MB) is cached at `DATA_DIR/maxroll-cache/data.min.<patch>.json`.
Invalidated only when the catalog patch changes (no sliding TTL). First call within a process
writes to disk; subsequent calls within the same process use an in-memory layer.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `MAXROLL_PLANNER_API_BASE` | `https://planners.maxroll.gg` | Override planner API origin |
| `MAXROLL_DATA_BASE` | `https://assets-ng.maxroll.gg` | Override data/assets origin |

## Tests

```sh
pnpm test -- --run __tests__/maxroll-import.test.ts
```

Hermetic (fixture-based, no live network). Fixtures live in `__tests__/fixtures/`.
