# lib/triage

Triage pipeline for D4 item screenshots: Vision LLM extraction → catalog ID resolution → UI display.

---

## Pipeline Overview

```
Screenshot (PNG/JPG/WebP/GIF)
  │
  ▼
Hash check → Cache lookup (lib/triage/cache.ts)
  │              │ hit → CacheEntry (item / no-item-detected / uncertain)
  │              │ miss ↓
  ▼
Anthropic Vision API (lib/triage/anthropic.ts)
  │  Model: claude-sonnet-4-5-20250929 (locked, do not change)
  │  Forced tool_use → LlmExtractedItem[]
  │  System prompt: cached catalog vocabulary (5-min TTL prompt cache)
  ▼
resolveItem() (lib/triage/resolve.ts)
  │  1. Unique short-circuit (D16) if rarity ∈ {unique, mythic}
  │  2. Slot resolution via item-types.json
  │  3. Per-affix: synonym expansion → Jaro-Winkler fuzzy match → value-format check
  │  4. Per-aspect: same algorithm
  ▼
ResolvedItem
  │  implicits / explicits / tempered: AffixMatchResult[]
  │  aspect: AspectMatchResult | undefined
  │  slotResult: SlotMatchResult
  ▼
UI (components/triage/)
  │  ComparisonPanel, DetailPane, ParsedItemCard, UncertainMatchPicker
```

---

## Modules

### `resolve.ts`

The core resolution logic. All functions are pure and testable without I/O.

#### `normalizeLabel(label: string): string`

Lowercases, strips non-alphanumeric characters, collapses whitespace. Used for both input labels and catalog labels before comparison.

```typescript
normalizeLabel("Maximum Life %")   // → "maximum life"
normalizeLabel("Crit. Strike Dmg") // → "crit strike dmg"
```

#### `jaroWinkler(s1, s2, p?): number`

In-house Jaro-Winkler similarity (D2 — no external fuzzy library). Returns a value in [0, 1]:

- `1.0` — identical strings
- `≥ 0.96` — treated as near-perfect (single-char typo or punctuation difference)
- `≥ 0.82` — considered a fuzzy match candidate
- `< 0.82` — below threshold, not a match

#### `resolveAffix(extracted, slotId, className): AffixMatchResult`

Resolves an LLM-extracted affix label to a catalog ID.

**Algorithm:**
1. Normalize the input label.
2. Expand via `synonyms.json` (e.g. `"max life"` → `"maximum life"`).
3. Score all class/slot-scoped catalog candidates with Jaro-Winkler.
4. If top score `≥ 0.96` (near-perfect): use that candidate.
5. If multiple candidates score `≥ 0.82` and top score `< 0.96`: return **ambiguous** with up to 5 candidate IDs.
6. If single candidate scores `≥ 0.82`:
   - If `isPercent` and value ∈ (0, 1]: multiply by 100, check range → **value-mismatch** (D4).
   - If value outside `[min, max]`: return **out-of-range**.
   - Otherwise: return **resolved**.
7. No candidates: return **no-match**.

**Result reasons:**

| reason | description |
|---|---|
| `"resolved"` | Confident match within value range |
| `"value-mismatch"` | Matched, but value looks like wrong unit (e.g. `0.05` → `5`); `unitCorrected` carries the corrected value |
| `"out-of-range"` | Matched but rolled value is outside `[min, max]`; `affixId` carries the match |
| `"ambiguous"` | Multiple candidates above threshold; `candidates[]` carries top IDs for user pick |
| `"no-match"` | No candidate above threshold |

#### `resolveAspect(extracted, slotId, className): AspectMatchResult`

Same algorithm as `resolveAffix` but operates on the aspect catalog. Uses the `aspect_aliases` section of `synonyms.json`. Result carries `aspectId` instead of `affixId`.

#### `resolveSlot(itemType, className): SlotMatchResult`

Maps an in-game item type string to slot ID(s) via `item-types.json`. Class overrides apply for Barbarian weapon slots.

#### `resolveItem(extracted, className): ResolvedItem`

Full pipeline entry point. Fires the **unique short-circuit** (D16) when `rarity ∈ {unique, mythic}` and the item name normalizes to a `UniqueEntry`:
- Slot is sourced directly from `UniqueEntry.slot` (bypasses slot inference).
- Aspect is sourced from `UniqueEntry.intrinsicAspects[0]` (bypasses aspect label fuzzy match).

---

### `anthropic.ts`

Thin wrapper around the Anthropic Vision API. Posts screenshots as base64-encoded image blocks with a forced `tool_use` call.

**Model:** `claude-sonnet-4-5-20250929` — do NOT change (locked per v17 brief).

**System prompt caching:** The system prompt includes catalog vocabulary (affix labels, aspect labels, item slot names) injected at call time with `cache_control: { type: "ephemeral" }` (5-minute TTL). This reduces token cost for burst triage sessions by ~70% on repeat calls within the TTL window.

---

### `cache.ts`

Filesystem-backed response cache keyed by SHA-256 hash of the image bytes. Entries are stored as `data/triage-cache/<hash>.json` and expire after 7 days.

Cache entry kinds:
- `"item"` — one or more items extracted successfully
- `"no-item-detected"` — LLM determined no item is visible
- `"uncertain"` — LLM could not reliably parse the screenshot

---

### `synonyms.json`

Alias table for the resolver. Keys are normalized affix/aspect display labels; values are canonical normalized labels as they appear in the catalog. Add entries when screenshot extractions consistently produce non-canonical forms that score below FUZZY_THRESHOLD.

**Adding an alias:**
```json
{
  "affix_aliases": {
    "my new alias": "canonical catalog label"
  }
}
```

---

### `item-types.json`

Maps in-game item type display strings to slot ID candidates. Class overrides handle Barbarian weapon specialization.

---

## Match-Rate Targets (v17)

| Category | Target | Basis |
|---|---|---|
| Affix — exact normalized | ≥ 95% | After synonym expansion |
| Affix — fuzzy (typo/abbrev) | ≥ 85% | Jaro-Winkler ≥ 0.82 |
| Aspect — exact | ≥ 90% | After synonym expansion |
| Unique — short-circuit | 100% | Name-to-UniqueEntry |
| Overall resolution | ≥ 60% resolved | Across replay fixtures |

### Fixture Replay Results (`__tests__/triage-real-screenshots.test.ts`)

| Fixture | Scenario | Resolved % |
|---|---|---|
| `helm-sorcerer` | Common rare helm — 4 standard Sorcerer affixes | 100% |
| `unique-harlequin` | Harlequin Crest (unique short-circuit) | ≥ 75% |
| `ring-aspect` | Legendary ring — affixes + Conceited Aspect | 100% |
| `chest-synonym` | Abbreviated labels ("Max Life", "Dmg Red") via synonyms | 100% |
| `ring-value-mismatch` | Percent-as-decimal extraction (0.07 instead of 7%) | 33% resolved, 67% value-mismatch |
| **OVERALL** | All fixtures combined | **≥ 80%** |

Value-mismatch results (reason `"value-mismatch"`) are meaningful resolutions — the affix was identified but the unit needs user confirmation. The overall resolve rate counts only `kind:"resolved"` results.

---

## Data Flow Decision Points

| Decision | Value | Source |
|---|---|---|
| D2 | Jaro-Winkler, in-house | No fuzzy library |
| D4 | isPercent + value ∈ (0,1] → × 100 | Unit auto-correct |
| D5 | "ambiguous" with candidates[] | Multiple hits above threshold |
| D7 | Flat reason union | No nested discriminated union |
| D16 | Unique short-circuit | rarity ∈ {unique,mythic} + name match |
| D18 | AspectEntry.source stays "legendary"\|"codex" | No "unique-intrinsic" 3rd value |
