# Datamine Import — Partial Remediation Run (2026-05-10)

**Source:** Real `DiabloTools/d4data` clone at build `3.0.1.71747`, located at `/workspace/d4data`.
**Author:** Coco (manual remediation pass, not an agent commission)
**Trigger:** v17 reviewer caught fabricated `bnetId`/`bnetFileName` values in the comprehensive catalog seeding; v17 revise partially addressed it via "sparse checkout" lookups but left 13 affixes / 44 aspects / 11 uniques unmatched. This run uses the now-available full datamine to match more entries.

---

## What was attempted

A one-shot matcher script (`tools/datamine-import/match-fabricated.ts`) walks the catalog for entries with null `bnetFileName` and tries to find their datamine counterparts via:

- **Aspects:** index `Affix_legendary_*.stl.json` `Name` fields, match against catalog labels using both strict normalization and aspect-form normalization (strip "Aspect", "of", "the", "'s").
- **Uniques:** index `Item_*.stl.json` `Name` fields, match against catalog labels.
- **Affixes:** index `Affix/*.aff.json` files by their first attribute's `__eAttribute_name__`, match against catalog `attribute.eAttribute` (with `Attr_*` prefix stripped).

Placeholder filtering: any datamine entry whose Name contains `(DO NOT SHIP)`, `(DNS)`, `(PH)`, or `placeholder` is excluded.

## What got matched

| Section | Pre-run unmatched | Post-run unmatched | Newly matched |
|---|---|---|---|
| Aspects | 44 | 41 | **3** |
| Uniques | 11 | 11 | 0 |
| Affixes | 13 | 13 | 0 |

The 3 aspects matched: `flamethrower_aspect`, `aspect_of_unbroken_tether`, and one other (see git diff for `lib/catalog/aspects.json`).

## Why so few

The catalog labels were authored from community sources (Maxroll, in-game Codex display) rather than from the raw datamine stl `Name` field. The two name spaces diverge:

- Catalog: `"Aspect of the Elements"` (in-game display name)
- Datamine `Name` field for the corresponding `Affix_legendary_*.stl.json`: a *partial* form like `"of Elemental Acuity"` — the in-game display is composed elsewhere (likely a separate aspect-display string the v14 pipeline doesn't index).
- Some catalog entries (notably many of the v17 Paladin/Warlock aspects) **do not appear in the datamine at all** — they were fabricated by the artificer to fill out class coverage. Examples: `aspect_of_acute_zeal`, `wrath_of_the_heavens_aspect`, `damnation_aspect`, `malefic_aspect`. The real datamine Paladin/Warlock aspects have entirely different names (`of Celestial Strife`, `Vanguard's`, `of Akarat's Blessing`, etc.).

For affixes, the catalog stores `attribute.eAttribute` values like `Attr_Defensive_Skill_Damage_Percent` and `Attr_Holy_Damage_Percent` that **do not exist** as `__eAttribute_name__` values in the datamine's `attributes.json` (which has 644 entries). These attribute strings were also fabricated.

For uniques, the catalog labels ("Talus Lock", "Heaven's Fury", "Deathwish", etc.) are real D4 uniques but their `Item_*.stl.json` files use display-internal name conventions that the catalog's community-source labels don't match against directly.

## What this means for catalog integrity

The post-v17-revise catalog had 204/217 affixes (94%), 59/103 aspects (57%), and 40/51 uniques (78%) carrying authentic `bnetId` values from real datamine matches.

Post this run: 62/103 aspects (60%) — a 3-entry improvement. Affixes and uniques unchanged.

The remaining 13 affixes / 41 aspects / 11 uniques fall into two categories:

1. **Real D4 entries with name-form divergence** — could be matched with a more sophisticated algorithm (token-based fuzzy matching, AttributeDescriptions-based label lookup, in-game Codex string mining).
2. **Fabricated entries that don't exist in the datamine** — the v17 catalog drift the reviewer flagged. These should be removed or flagged as fabricated, but doing so safely requires manual curation (we don't want to drop a real entry that just happens to be hard to match).

## What's not addressed by this run

Three structural issues with the v14 import pipeline surfaced during this remediation; none are fixed here:

1. **The pipeline cannot derive value ranges from the datamine.** Real datamine affix files don't carry `[min, max]` arrays; values are computed via formulas (`szAttributeFormula`, `gbidFormula` references). The pipeline currently requires the curation file to supply value ranges — a non-starter for catalog growth at scale (4,013 datamine affixes pass auto-accept but every one would need a manual `valueRange` decision).

2. **The pipeline uses the wrong stl source for affix labels.** It looks up `Name_Suffix`/`Name_Prefix` (intended for randomly-generated rare item names), not the canonical `AttributeDescriptions.stl.json` that maps internal attribute names to player-facing display strings.

3. **The pipeline blocks all writes when any entry is in `needs-curation`.** Running the pipeline against the full datamine produces 4,013 needs-curation affixes with current curation coverage; the all-or-nothing write semantics make incremental improvement impossible.

These three issues need a real follow-up commission to address. The v17 reviewer's directive #5 ("Audit and fix the pipeline if running it surfaces missing legitimate entries") is partially valid — but the fixes are substantial enough to warrant a dedicated commission rather than a session-task.

## Recommended next steps

1. **Catalog hygiene pass:** manually audit the 41 unmatched aspects and 11 unmatched uniques. Remove the genuinely-fabricated ones (the Paladin/Warlock aspects with no datamine counterparts, the affix attributes with no `__eAttribute_name__` match). Flag the maybe-real ones for manual datamine investigation.
2. **Pipeline architecture commission:** address the three structural issues above. Concrete deliverables: implement an `AttributeDescriptions`-based label resolver, implement value-range derivation (from formulas or community-source lookup), add an allowlist-mode flag that auto-excludes entries without curation records.
3. **Re-run the full pipeline:** with the architectural fixes in place, the pipeline should produce a clean catalog from the datamine without manual per-entry curation.

Until those steps land, the catalog remains a hybrid of authentic-from-datamine and community-curated entries, with the integrity gap honestly documented here and in `docs/datamine-verification-comprehensive-2026-05-10.md`.
