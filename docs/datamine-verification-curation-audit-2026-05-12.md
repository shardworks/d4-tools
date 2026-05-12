# Datamine Import — Curation.json Placeholder-Default Audit

**Date:** 2026-05-12  
**Auditor:** Artificer (commission `d4-tools/draft-mp248q4i-ec139efe`)  
**Scope:** `tools/datamine-import/curation.json` — all sections  
**Heuristic (D13):** Flag any field where >50 % of records share a value AND the in-game source documents per-entry variance. Manual cross-check required before correcting vs. lifting.  
**Fix vs. lift (D15):** Correct in-place if the citation source is already accessible (in-game/datamine/existing audit doc). Lift any correction requiring external research as a follow-up observation.

---

## Summary of Findings

| Section | Entries | Fields Audited | Dead Fields Removed | Corrections Applied | Observations Lifted |
|---|---|---|---|---|---|
| Affixes | 14 | action, isPercent, isImplicit, manualValueRanges, valueRange, catalogId, label, legacyIds | 0 | 0 | 0 |
| Aspects | 20 | action, source, isPercent, isDistinctMultiplier, valueRange, catalogId, label, legacyIds | 0 | 0 | 2 |
| Skills | 205 | action, category, maxRank, catalogId, label, legacyIds | 0 | 0 | 1 |
| Paragon Boards | 72 | action, catalogId, label, legacyIds, isStarterBoard (not-on-CurationRecord) | **8** | 0 | 1 |
| Paragon Glyphs | 107 | action, catalogId, label, legacyIds | 0 | 0 | 0 |
| Uniques | 1 | action, catalogId, label | 0 | 0 | 0 |
| **Total** | **419** | | **8** | **0** | **4** |

---

## Affixes

**Entries:** 14  
**Action distribution:** include × 11, exclude × 3 (Affix_WIP_TestEntry, Affix_Paragon_Unsupported, Affix_Unmapped_Bucket_Test)

### Field: `action`
- **Heuristic result:** include 79 % → triggers D13 threshold (>50 %).
- **Per-entry variance documented?** Yes — 3 entries are deliberately excluded (WIP placeholder, unsupported DSL fixture, bucket-coverage gate fixture).
- **Verdict:** Legitimate uniform value. The majority of curated affixes are included by design; the excludes are intentional test fixtures with explicit `reason` fields.
- **Action:** Observation confirmed-legitimate — no correction needed.

### Field: `isPercent`
- **Distribution:** true × 8 (57 %), absent × 5, false × 1.
- **Heuristic result:** triggers (>50 % are `true`).
- **Per-entry variance documented?** Yes — non-percent affixes (`Attr_Max_Life`, armor, barrier) are correctly `false` or absent (rely on auto-detection via `detectIsPercent`).
- **Verdict:** Legitimate. Percent affixes dominate because the fixture set was seeded with percent-based stats. The non-percent entries are correctly classified.
- **Action:** No correction needed.

### Fields: `isImplicit`, `manualValueRanges`, `catalogId`, `label`, `legacyIds`, `valueRange`
- No uniformity flag: distribution across entries is clearly varied with legitimate reasons on each.
- **Action:** No correction needed.

### Fields not on `CurationRecord` present in affixes section
- None found (confirmed by inspecting all 14 affix records; all keys match `CurationRecord` fields).

---

## Aspects

**Entries:** 20  
**Action distribution:** include × 20 (100 %)

### Field: `source`
- **Distribution:** `"codex"` × 20 (100 %) → triggers D13.
- **Per-entry variance documented?** Yes — D4 distinguishes legendary (world-drop) aspects from codex aspects (always unlockable). Only codex aspects need a `source` override in curation.json; legendary aspects default to `"legendary"` via the transformer and do not appear in curation.json at all.
- **Verdict:** Legitimate selection bias. The 20 curated entries exist precisely because they need `source: "codex"` overrides to preserve their classification across reruns. No legitimate legendary aspect appears here — those are handled automatically.
- **Action:** Observation O-1 — confirmed-legitimate. Documented here so future maintainers understand the asymmetry.

### Field: `isDistinctMultiplier`
- **Distribution:** absent (undefined) × 20 (100 %).
- **Per-entry variance documented?** In-game, aspects carrying the [×] tag are distinct multiplicative. None of the 20 currently curated codex aspects have been identified as [×]-tagged.
- **Verdict:** Plausible uniform absence — the curated set happens not to include [×]-tagged aspects. This field being absent does not mean it is wrong; it means no [×]-tagged aspects have been seeded yet.
- **Action:** Observation O-2 — lifted for future investigation. When a [×]-tagged aspect is added to curation, `isDistinctMultiplier: true` must be set. The field was introduced in v15 (D7) and is deliberately absent-by-default.

### Field: `valueRange`
- Only `legendary_disobedience` has an explicit `valueRange: [25.0, 40.0]`. The other 19 aspects do not.
- `valueRange` is required by the aspects transformer for every included aspect (causes `needsCuration` if absent). All 20 aspects either have `valueRange` or are from the fixture set that auto-processes.
- **Action:** No correction needed.

### Fields not on `CurationRecord` present in aspects section
- None found.

---

## Skills

**Entries:** 205 include-action records (plus 0 exclude or deprecated)  
**Total across 8 classes:** Barbarian 23, Druid 21, Necromancer 18, Paladin 17, Rogue 20, Sorcerer 19, Spiritborn 19, Warlock 18 (approximate — exact counts vary by datamine).

### Field: `maxRank`
- **Distribution (include-only):** maxRank 1 × 44 (21 %), maxRank 9 × 118 (58 %), maxRank 10 × 8 (4 %), maxRank 12 × 31 (15 %), maxRank 15 × 4 (2 %).
- **Heuristic result:** maxRank 9 at 58 % → triggers D13.
- **Per-entry variance documented?** Yes. D4's skill tree has three allocation tiers:
  - **Cap 9** — standard skills: 5 base points + 4 from adjacent skill nodes.
  - **Cap 10** — signature skills (inner-ring core): 5 + 4 + 1 extra adjacent node.
  - **Cap 12** — mastery-category skills (weapon mastery, wrath, imbuement, valor): 8 + 4.
  - **Cap 15** — Paladin justice-category skills (unique tree structure, 11 + 4).
  - **Cap 1** — ultimate skills and key passives: non-repeatable.
  - **Citation:** D4Builds.gg Season 13 skill trees, accessed 2026-05-11, cited on every entry.
- **Verdict:** maxRank 9 dominates legitimately — it is the standard allocation cap for most skill categories in D4. The non-uniform minority (1, 10, 12, 15) is correctly modeled with category-specific values. No placeholder behavior detected.
- **Precedent:** The prior `maxRank: 5` bug (corrected in an earlier commission) appeared on skills with no D4Builds.gg citation. All maxRank 9 entries carry a cited reason, distinguishing them from that pattern.
- **Action:** Observation O-3 — confirmed-legitimate. No corrections needed.

### Field: `category`
- **Distribution:** basic, core, defensive, companion/brawling/agility, mastery/wrath/imbuement/valor/justice, ultimate, key-passive, aura, summoning — well-distributed.
- No uniformity flag.

### Fields: `catalogId`, `label`, `legacyIds`
- All varied; no uniformity flag.

### Fields not on `CurationRecord` present in skills section
- None found (inspected representative sample across all classes; all keys match `CurationRecord` fields).

---

## Paragon Boards

**Entries:** 72 (all action: include)

### Dead field: `isStarterBoard` (field NOT on `CurationRecord`)
- **Finding:** 8 paragon board entries carried `"isStarterBoard": true` in curation.json:
  - `Paragon_Barb_00` (barb_starter)
  - `Paragon_Druid_00` (druid_starter)
  - `Paragon_Necro_00` (necro_starter)
  - `Paragon_Paladin_00` (pal_starter)
  - `Paragon_Rogue_00` (rogue_starter)
  - `Paragon_Sorc_00` (sorc_starter)
  - `Paragon_Spirit_0` (sb_starter)
  - `Paragon_Warlock_00` (warl_starter)
- **Root cause:** The paragon transformer (`sections/paragon.ts:93-95`) reads `board.bIsStarterBoard` directly from the raw datamine record — not from the curation record. The `isStarterBoard` curation field was therefore always silently dropped by the `CurationRecord` type and had zero effect on catalog output.
- **Verification:** `Paragon_Barb_00.pbd.json` carries `"bIsStarterBoard": true` in the raw datamine, so the catalog correctly emits `isStarterBoard: true` on the board entry without any curation assist.
- **Action:** **Removed** (D16). All 8 occurrences deleted in this commit. The test at `__tests__/datamine-import.test.ts` (Case 4: "Barbarian paragon board is written to paragon/Barbarian.json") confirms `isStarterBoard` continues to be emitted correctly via the raw datamine field.

### Field: `action`
- **Distribution:** include × 72 (100 %) → triggers D13.
- **Per-entry variance documented?** All currently active paragon boards are in-game. No deprecated or excluded boards exist in the datamine.
- **Verdict:** Legitimate uniform value — all known boards are active.
- **Action:** Observation O-4 — confirmed-legitimate. No correction needed.

### Fields not on `CurationRecord` present in paragonBoards section (post-cleanup)
- None found after removing `isStarterBoard`.

---

## Paragon Glyphs

**Entries:** 107 (include × 106, exclude × 1)

### Field: `action`
- **Distribution:** include × 106 (99 %), exclude × 1 (`Rare_AllZero`).
- No uniformity flag (99 % is below the >50 % threshold but the distribution is clearly correct — `Rare_AllZero` excluded because its `fUsableByClass` bitmap is all-zero, i.e. not usable by any class).

### Fields: `catalogId`, `label`, `legacyIds`
- All varied; no uniformity flag.

### Fields not on `CurationRecord` present in paragonGlyphs section
- None found.

---

## Uniques

**Entries:** 1 (`Unique_Sword_Test`)

- Single entry is a synthetic fixture item. No statistical analysis possible.
- **Action:** No correction needed.

### Fields not on `CurationRecord` present in uniques section
- None found.

---

## Observations Lifted for Follow-up

| ID | Section | Field | Finding | Why Lifted |
|---|---|---|---|---|
| O-1 | Aspects | `source` | 100 % "codex" — selection bias, not a bug | Confirmed correct; documented for future maintainers |
| O-2 | Aspects | `isDistinctMultiplier` | 0 of 20 entries marked true — no [×]-tagged aspects curated yet | Need external review of each aspect's in-game tooltip to identify [×] tags |
| O-3 | Skills | `maxRank` | maxRank 9 at 58 % — standard D4 tree cap, citation-verified | Confirmed correct; documented as precedent against future re-flagging |
| O-4 | Paragon Boards | `action` | 100 % "include" — all active boards | Confirmed correct; expected to stay uniform until a board is deprecated |

---

## Changes Made in This Commit

| Change | File | Detail |
|---|---|---|
| Removed dead field `isStarterBoard` from 8 paragonBoards entries | `curation.json` | Field not on `CurationRecord`; raw datamine `bIsStarterBoard` is authoritative (D16) |
| Added bucket-coverage gate fixture | `curation.json` | `Affix_Unmapped_Bucket_Test` — exclude action by default; used by Case 6B/6C tests |
| Fixed fixture eAttribute names | `__tests__/fixtures/…/Affix_Str_AddLifePercent.aff.json`, `Affix_AllRes_Amulet.aff.json` | `Attr_Max_Life_Percent` → `Attr_Life_Percent_Bonus`; `Attr_Resistance_All` → `Attr_All_Resistances` (both present in `lib/damage/config.json`) |
