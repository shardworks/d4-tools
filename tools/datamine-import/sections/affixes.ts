/**
 * Affix section transformer.
 *
 * Transforms raw datamine affix data → AffixEntry[] with curation applied.
 *
 * Actual datamine format (DiabloTools/d4data):
 *   eAffixType: integer — 2 = regular player-rollable affixes
 *   arAllowedItemLabels: integer[] — item label IDs (not strings)
 *   fAllowedForPlayerClass: number[] — bit flags, index 0-7 per AFFIX_CLASS_ORDER
 *   ptItemAffixAttributes[0].tAttribute.gbidFormula.name: string — named formula
 *   ptItemAffixAttributes[0].tAttribute.szAttributeFormula.value: string — embedded formula
 *   No afValue field — value ranges are derived from formula evaluation (D2/D3)
 *
 * Value-range derivation (D2/D3):
 *   For each IP band in the formula record, evaluate at band floor (position=min) and
 *   ceiling (position=max). Multiply by 100 when isPercent. Store as valueRanges (D1).
 *
 * Implicit fallback (D11/D12):
 *   When isImplicit=true and the formula chain yields "0" or empty, consult
 *   curation record's manualValueRanges. If absent, push to needsCuration with
 *   reason "no-formula-and-no-fallback" (D12).
 *
 * Unsupported DSL functions (D5/D6):
 *   If evaluate() throws UnsupportedFunctionError, push to needsCuration with
 *   reason "unsupported-function: <fnName>" and skip the entry.
 */

import type { AffixEntry } from "../../../lib/catalog/index";
import type { CurationFile } from "../curation";
import { getCurationRecord, applyStrictHeuristics } from "../curation";
import { LABEL_TO_SLOTS, AFFIX_CLASS_ORDER } from "../mappings";
import { parseTemplate } from "../template";
import { detectIsPercent } from "../percent";
import { toBnetFileName } from "../file-name";
import {
  evaluateFormulaBands,
  UnsupportedFunctionError,
} from "../formulas/index";
import type { FormulaRecord, ValueRangeBand } from "../formulas/index";
import type { AffixScalars } from "../formulas/constants";
import type { TransformerSummary } from "./types";

// ─── Helper: snakeCasify a bnetFileName to a catalog id ──────────────────────

function toSnakeCase(s: string): string {
  return s
    .replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`)
    .replace(/^_/, "")
    .replace(/__+/g, "_")
    .toLowerCase();
}

// ─── Helper: unique-intrinsic / non-rollable filename detection ──────────────

/**
 * Returns true when an `eAffixType === 2` affix's filename matches a known
 * non-rollable-intrinsic pattern that should be filtered from the regular
 * affix catalog (D8b).
 *
 * The patterns recognized here are the ones the d4data conventions consistently
 * apply to unique-item intrinsics, tempering recipes, talisman intrinsics, and
 * charm intrinsics. These entries share `eAffixType === 2` with player-rollable
 * affixes but are bound to specific items / recipes rather than rolled by the
 * affix-roll system. Excluding them from the affix catalog removes thousands
 * of empty-label needs-curation entries that are not actionable (there is no
 * meaningful curation for an intrinsic that lives on its unique).
 *
 * The complementary `intrinsicAffixes` data on `UniqueEntry` carries the
 * unique-bound versions of these mechanically; the tempering and talisman /
 * charm catalogs are handled (or will be) by their own pipelines.
 */
function isNonRollableIntrinsicFileName(basename: string): boolean {
  // Item-type-prefixed unique intrinsic: e.g. `Helm_Unique_Generic_002`,
  // `2HStaff_Unique_AF_001_Int_Decrease`, `Boots_Unique_Druid_100`.
  if (/^(?:[12]H)?[A-Z][a-zA-Z]*_Unique_/i.test(basename)) return true;
  // UBERUNIQUE / UNIQUE prefix or suffix markers — both forms appear in
  // d4data depending on the affix's authoring period.
  if (/^(?:UBER)?UNIQUE_/.test(basename)) return true;
  if (/_(?:UBER)?UNIQUE(?:[_a-zA-Z0-9-]*)$/.test(basename)) return true;
  if (/_Unique(?:Random|Rand)?$/i.test(basename)) return true;
  // Tempering / talisman / charm intrinsic prefixes.
  if (/^(?:Tempered|Talisman|Charm)_/.test(basename)) return true;
  // SetItem affixes (sets are intrinsic to the item, not rolled).
  if (/_SetItem(?:_|$)/i.test(basename)) return true;
  // INHERENT_ — inherent-to-item-type intrinsics, e.g. ring all-resist
  // intrinsics, weapon inherent overpower damage.
  if (/^INHERENT_/.test(basename)) return true;
  // Greater / Lesser variants — special enhanced/reduced rolls that share
  // their parent affix's label and aren't independently player-facing.
  if (/_(?:Greater|Lesser|Higher|Bigger|Double|Triple)(?:_|$)/i.test(basename)) return true;
  // Legacy / season-rebalance variants — historical alternates kept in the
  // datamine but not player-rollable in the current patch.
  if (/_(?:Legacy|S\d+Rebalance)(?:_|$)/i.test(basename)) return true;
  // ALWAYSMAX variants — special always-rolls-max test/debug affixes.
  if (/_ALWAYSMAX(?:_|$)/i.test(basename)) return true;
  // Test / template / placeholder affixes.
  if (/^(?:TEMPLATE|TEST|DEPRECATED|MISSING|PLACEHOLDER)_/i.test(basename)) return true;
  // SMP_ / Season_ / S\d+_AprilFools — sandbox, seasonal items, novelty
  // event affixes that are not part of the regular rollable pool.
  if (/^(?:SMP|zzSMP)_/.test(basename)) return true;
  if (/^Season_Socketable_/.test(basename)) return true;
  if (/^S\d+_AprilFools/.test(basename)) return true;
  // zz-prefixed placeholders (e.g. `zzMountArmor`, `zzOLDHUMAN_…`) — legacy
  // or development entries the d4data conventions keep behind a deliberate
  // sort-suffix to hide them from rolling.
  if (/^zz/.test(basename)) return true;
  // Item-cosmetic affix records carry no rollable values.
  if (/_Cosmetic_/.test(basename)) return true;
  // X2_Transfiguration_* — mythic transfiguration recipes / runeword
  // transformations, not part of the regular affix roll pool.
  if (/^X2_Transfiguration_/.test(basename)) return true;
  // VGN_ — vessel-of-hatred-internal namespace; entries lack player labels.
  if (/^VGN_/.test(basename)) return true;
  // Explicit `Unique_` prefix marker.
  if (/^Unique_/.test(basename)) return true;
  // PassiveRankBonus + SkillRankBonus class-specific variants — the
  // explicitly unique-bound and `Scaled` / multi-attribute variants are
  // intrinsic to specific items, not the regular affix pool.
  if (/^PassiveRankBonus_.*_(?:Unique|Scaled2H)$/i.test(basename)) return true;
  return false;
}

// ─── Raw datamine affix shape ─────────────────────────────────────────────────

interface RawAffixAttributeSpec {
  eAttribute: number;
  __eAttribute_name__?: string;
  nParam: number;
  gbidFormula?: { name?: string };
  szAttributeFormula?: { value?: string };
}

interface RawAffixAttribute {
  tAttribute: RawAffixAttributeSpec;
}

interface RawAffix {
  __fileName__: string;
  __snoID__: number;
  eAffixType: number;
  arAllowedItemLabels: number[];
  fAllowedForPlayerClass: number[];
  ptItemAffixAttributes: RawAffixAttribute[];
}

// ─── Formula provenance record (for audit doc D22) ────────────────────────────

export interface AffixFormulaProvenance {
  catalogId: string;
  bnetFileName: string;
  /** "named:<formulaName>" | "embedded:<formulaText>" | "implicit-fallback" | "zero-chain" */
  formulaSource: string;
  evaluatedBandCount: number;
  /** Number of ptItemAffixAttributes entries on the source affix; >1 means the
   * catalog represents only the first attribute (D18). */
  attributeCount: number;
}

// ─── TransformerSummary extension ────────────────────────────────────────────

export interface AffixTransformerSummary extends TransformerSummary<AffixEntry> {
  /** Per-affix formula provenance for the audit doc (D22). */
  formulaProvenance: AffixFormulaProvenance[];
}

// ─── Transformer ──────────────────────────────────────────────────────────────

export function transformAffixes(
  rawAffixes: unknown[],
  stringTable: Map<string, string>,
  curation: CurationFile,
  formulaTable: Map<string, FormulaRecord>,
  scalars: AffixScalars
): AffixTransformerSummary {
  const entries: AffixEntry[] = [];
  const needsCuration: Array<{ bnetFileName: string; reason: string }> = [];
  const deprecated: Array<{ bnetFileName: string; catalogId: string }> = [];
  const excluded: string[] = [];
  const formulaProvenance: AffixFormulaProvenance[] = [];

  for (const raw of rawAffixes) {
    const affix = raw as RawAffix;
    // Real d4data emits `__fileName__` as a full path with extension
    // ("base/meta/Affix/X2_…2HMace.aff"). The catalog's `bnetFileName`, every
    // curation key, and every downstream consumer use the basename only. Keep
    // the raw form for stringTable lookups (which are keyed by full path) and
    // the normalized form for curation lookups and the output `bnetFileName`.
    const rawFileName = affix.__fileName__;
    const fileName = toBnetFileName(rawFileName);

    // D8: filter to eAffixType === 2 (regular player-rollable affixes only)
    if (affix.eAffixType !== 2) {
      continue;
    }

    // Check curation override BEFORE the non-rollable name filter (D8c).
    // An explicit `action: "include"` in curation bypasses the non-rollable heuristic
    // for files that live in filtered namespaces (e.g. INHERENT_*, zzSMP_*) but carry
    // player-relevant implicit stats (ring all-resist, implicit armor, etc.).
    const curationRecord = getCurationRecord(curation, "affixes", fileName);

    // Auto-exclude unique-item intrinsic affixes (D8b). These share the
    // eAffixType=2 marker with player-rollable affixes but are mechanically
    // intrinsic-to-the-unique; they belong on UniqueEntry.intrinsicAffixes, not
    // the regular affix catalog. Filename patterns:
    //   - `<ItemType>_Unique_<...>` — item-type-prefixed unique intrinsics
    //   - `<...>_UNIQUE` / `<...>_UBERUNIQUE` — suffix-marked unique intrinsics
    //   - `Tempered_<...>` — tempering recipe affixes (handled separately)
    //   - `Talisman_<...>` — talisman intrinsics (out of scope)
    //   - `Charm_<...>` — charm intrinsics (out of scope)
    // Skipped when curation explicitly includes the file via action:"include" (D8c).
    if (isNonRollableIntrinsicFileName(fileName) && curationRecord?.action !== "include") {
      excluded.push(fileName);
      continue;
    }

    // Look up the display label from the per-file string table.
    const szLabelSuffix = stringTable.get(`${rawFileName}::Name_Suffix`) ?? "";
    const szLabelPrefix = stringTable.get(`${rawFileName}::Name_Prefix`) ?? "";
    const szLabel = szLabelSuffix || szLabelPrefix;

    // Apply strict heuristics (D17)
    const heuristic = applyStrictHeuristics({ fileName, szLabel });

    if (curationRecord) {
      if (curationRecord.action === "exclude") {
        excluded.push(fileName);
        continue;
      }
      if (curationRecord.action === "deprecated") {
        const catalogId = curationRecord.catalogId ?? `affix_${toSnakeCase(fileName)}`;
        deprecated.push({ bnetFileName: fileName, catalogId });
        // Still include with deprecated flag
      }
    } else if (!heuristic.autoAccept) {
      // No curation override and heuristic rejects → needs curation
      needsCuration.push({ bnetFileName: fileName, reason: heuristic.reason ?? "unknown" });
      continue;
    }

    // Must have at least one attribute
    if (!affix.ptItemAffixAttributes || affix.ptItemAffixAttributes.length === 0) {
      needsCuration.push({ bnetFileName: fileName, reason: "no attributes" });
      continue;
    }

    // D18: multi-attribute affixes (one stl entry, multiple eAttribute slots) —
    // the catalog represents one attribute per AffixEntry, so we take the first
    // and record it on `formulaProvenance` for the audit trail. The remaining
    // attributes can be modelled by a curation override that splits the affix
    // into multiple entries if a downstream consumer needs them.
    //
    // This branch was previously a needsCuration flag, but it blocked import
    // writes for ~25 well-formed multi-attribute affixes whose first-attribute
    // import is correct (BloodOrb_Damage, Elite_Kill_*, Lucky_Hit_*). The
    // flag is now informational only — the entry still imports cleanly.
    const multiAttrCount = affix.ptItemAffixAttributes.length;

    const firstAttr = affix.ptItemAffixAttributes[0];

    // The numeric eAttribute has a companion string name field __eAttribute_name__.
    const attributeName =
      firstAttr.tAttribute.__eAttribute_name__ ??
      String(firstAttr.tAttribute.eAttribute);

    // Percent detection (D27) — use attribute name and label
    const { isPercent: isPercentDetected } = detectIsPercent(attributeName, szLabel);
    const isPercent = curationRecord?.isPercent ?? isPercentDetected;

    // ── Implicit flag ─────────────────────────────────────────────────────────
    const isImplicit = curationRecord?.isImplicit ?? false;

    // ── Formula derivation (D2/D3) ────────────────────────────────────────────
    // Read order: gbidFormula.name first, then szAttributeFormula.value (D16), then zero/empty.
    const gbidName = firstAttr.tAttribute.gbidFormula?.name;
    const embeddedFormula = firstAttr.tAttribute.szAttributeFormula?.value;

    let formulaRecord: FormulaRecord | null = null;
    let formulaSource = "";

    if (gbidName) {
      const record = formulaTable.get(gbidName);
      if (record) {
        formulaRecord = record;
        formulaSource = `named:${gbidName}`;
      } else {
        // Named formula not found in table — treat as zero/missing
        formulaSource = `named-missing:${gbidName}`;
      }
    } else if (embeddedFormula && embeddedFormula !== "0" && embeddedFormula.trim() !== "") {
      // D16: synthesize a single-band record for the embedded formula
      formulaRecord = {
        name: `__embedded__:${fileName}`,
        arAffixScalings: [{ nMinItemPower: 0, szFormula: embeddedFormula }],
      };
      formulaSource = `embedded:${embeddedFormula}`;
    } else {
      formulaSource = "zero-chain";
    }

    // ── Evaluate bands or apply fallback ──────────────────────────────────────
    let valueRanges: ValueRangeBand[] | null = null;

    if (formulaRecord) {
      try {
        const evaluated = evaluateFormulaBands(formulaRecord, scalars, isPercent);
        // D19: require non-empty (evaluateFormulaBands asserts this internally)
        valueRanges = evaluated;
      } catch (err) {
        if (err instanceof UnsupportedFunctionError) {
          // D5: fail-loud for unsupported DSL functions in triage-relevant affixes
          needsCuration.push({
            bnetFileName: fileName,
            reason: `unsupported-function: ${err.fnName}`,
          });
          continue;
        }
        // Other evaluation errors
        needsCuration.push({
          bnetFileName: fileName,
          reason: `formula-eval-error: ${String(err)}`,
        });
        continue;
      }
    }

    // D11b: curation manualValueRanges override — always applied when specified,
    // replacing any formula-derived result. Used for affixes whose formula output is a
    // coefficient rather than the player-visible in-game value (e.g. AffixInversePercentage
    // for flat hitpoints) and for implicit affixes with zero-chain formulas.
    if (curationRecord?.manualValueRanges && curationRecord.manualValueRanges.length > 0) {
      valueRanges = curationRecord.manualValueRanges.map((b) => ({
        minItemPower: b.minItemPower,
        min: b.min,
        max: b.max,
      }));
      formulaSource = "curation-override";
    }

    // If formula yielded zero or no formula (and no curation override), fail loud (D11/D12)
    if (!valueRanges || (valueRanges.length === 1 && valueRanges[0].min === 0 && valueRanges[0].max === 0)) {
      if (isImplicit) {
        // D12: implicit affix without formula and without curation override — fail build
        needsCuration.push({
          bnetFileName: fileName,
          reason: "no-formula-and-no-fallback",
        });
        continue;
      } else if (!valueRanges) {
        // Non-implicit, no formula derivation available
        needsCuration.push({
          bnetFileName: fileName,
          reason: "no-value-range: no formula found and not an implicit affix",
        });
        continue;
      }
      // Non-implicit with zero formula chain: keep the zero band (may be intentional)
    }

    // Template parsing — use szLabel or attribute name as fallback
    const { labelTemplate } = parseTemplate(szLabel || `{value}`);

    // Slot mapping via integer label intersection — overridden by curation when present
    const rawLabels: number[] = affix.arAllowedItemLabels ?? [];
    const slotRestrictions =
      curationRecord?.manualSlotRestrictions !== undefined
        ? curationRecord.manualSlotRestrictions
        : mapSlotsFromLabels(rawLabels);

    // Class mapping via fAllowedForPlayerClass bit array
    const classBits: number[] = affix.fAllowedForPlayerClass ?? [];
    const classRestrictions = mapClassesFromBits(classBits);

    // Derive catalogId and label
    const catalogId =
      curationRecord?.catalogId ?? `affix_${toSnakeCase(fileName)}`;
    const label = curationRecord?.label ?? szLabel;

    const entry: AffixEntry = {
      id: catalogId,
      label,
      labelTemplate,
      valueRanges: valueRanges as [ValueRangeBand, ...ValueRangeBand[]],
      isPercent,
      slotRestrictions,
      classRestrictions,
      bnetId: affix.__snoID__,
      bnetFileName: fileName,
      // v15 (D6): emit attribute reference for damage engine bucket routing
      attribute: {
        eAttribute: attributeName,
        nParam: firstAttr.tAttribute.nParam,
      },
    };

    if (isImplicit) {
      entry.isImplicit = true;
    }

    if (curationRecord?.weaponSpeedClass) {
      entry.weaponSpeedClass = curationRecord.weaponSpeedClass;
    }

    if (curationRecord?.action === "deprecated") {
      entry.deprecated = true;
    }

    entries.push(entry);

    // D22: record per-affix formula provenance for audit doc
    formulaProvenance.push({
      catalogId,
      bnetFileName: fileName,
      formulaSource,
      evaluatedBandCount: valueRanges.length,
      attributeCount: multiAttrCount,
    });
  }

  return { entries, needsCuration, deprecated, excluded, formulaProvenance };
}

/**
 * Maps integer arAllowedItemLabels → catalog slot IDs using LABEL_TO_SLOTS.
 * Unions all slots from all provided labels, deduplicating.
 * An empty label array means the affix is allowed on all slots (return []).
 */
function mapSlotsFromLabels(labels: number[]): string[] {
  if (labels.length === 0) return [];

  const result = new Set<string>();

  for (const label of labels) {
    const slots = LABEL_TO_SLOTS[label];
    if (slots !== undefined) {
      for (const slot of slots) {
        result.add(slot);
      }
    }
    // Unknown label → ignore (affix may be for a slot type we don't model)
  }

  return [...result];
}

/**
 * Maps fAllowedForPlayerClass bit array → class name array.
 * Index 0 = Sorcerer, 1 = Druid, ..., per AFFIX_CLASS_ORDER.
 * An empty array or all-zeros means all classes allowed (return []).
 */
function mapClassesFromBits(bits: number[]): string[] {
  if (bits.length === 0) return [];

  const allSet = bits.every((b) => b === 0);
  if (allSet) return []; // all-zeros → unrestricted

  const result: string[] = [];
  for (let i = 0; i < bits.length && i < AFFIX_CLASS_ORDER.length; i++) {
    if (bits[i]) {
      result.push(AFFIX_CLASS_ORDER[i]);
    }
  }

  // If all 8 flags are set → unrestricted (same as all-zeros)
  if (result.length === AFFIX_CLASS_ORDER.length) return [];

  return result;
}
