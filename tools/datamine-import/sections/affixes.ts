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
    const fileName = affix.__fileName__;

    // D8: filter to eAffixType === 2 (regular player-rollable affixes only)
    if (affix.eAffixType !== 2) {
      continue;
    }

    // Look up the display label from the per-file string table.
    const szLabelSuffix = stringTable.get(`${fileName}::Name_Suffix`) ?? "";
    const szLabelPrefix = stringTable.get(`${fileName}::Name_Prefix`) ?? "";
    const szLabel = szLabelSuffix || szLabelPrefix;

    // Apply strict heuristics (D17)
    const heuristic = applyStrictHeuristics({ fileName, szLabel });

    // Check curation override
    const curationRecord = getCurationRecord(curation, "affixes", fileName);

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

    // D18: use first attribute only for multi-attribute affixes, auto-flag for curation
    const isMultiAttr = affix.ptItemAffixAttributes.length > 1;
    if (isMultiAttr && !curationRecord) {
      needsCuration.push({
        bnetFileName: fileName,
        reason: "multi-attribute affix: using first attribute only per D18",
      });
      // Still include (use first attribute)
    }

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

    // If formula yielded zero or no formula, try implicit fallback (D11/D12)
    if (!valueRanges || (valueRanges.length === 1 && valueRanges[0].min === 0 && valueRanges[0].max === 0)) {
      if (isImplicit && curationRecord?.manualValueRanges && curationRecord.manualValueRanges.length > 0) {
        // D11: use manualValueRanges from curation as fallback
        valueRanges = curationRecord.manualValueRanges.map((b) => ({
          minItemPower: b.minItemPower,
          min: b.min,
          max: b.max,
        }));
        formulaSource = "implicit-fallback";
      } else if (isImplicit) {
        // D12: implicit affix without formula and without fallback — fail build
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

    // Slot mapping via integer label intersection
    const rawLabels: number[] = affix.arAllowedItemLabels ?? [];
    const slotRestrictions = mapSlotsFromLabels(rawLabels);

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
