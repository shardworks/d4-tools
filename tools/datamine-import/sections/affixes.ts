/**
 * Affix section transformer.
 *
 * Transforms raw datamine affix data → AffixEntry[] with curation applied.
 *
 * Actual datamine format (DiabloTools/d4data):
 *   eAffixType: integer — 2 = regular player-rollable affixes
 *   arAllowedItemLabels: integer[] — item label IDs (not strings)
 *   fAllowedForPlayerClass: number[] — bit flags, index 0-7 per AFFIX_CLASS_ORDER
 *   ptItemAffixAttributes[0].tAttribute.__eAttribute_name__: string attribute name
 *   No afValue field — value ranges come from curation record's valueRange field
 */

import type { AffixEntry } from "../../../lib/catalog/index";
import type { CurationFile } from "../curation";
import { getCurationRecord, applyStrictHeuristics } from "../curation";
import { LABEL_TO_SLOTS, AFFIX_CLASS_ORDER } from "../mappings";
import { parseTemplate } from "../template";
import { detectIsPercent } from "../percent";
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

// ─── Transformer ──────────────────────────────────────────────────────────────

export function transformAffixes(
  rawAffixes: unknown[],
  stringTable: Map<string, string>,
  curation: CurationFile
): TransformerSummary<AffixEntry> {
  const entries: AffixEntry[] = [];
  const needsCuration: Array<{ bnetFileName: string; reason: string }> = [];
  const deprecated: Array<{ bnetFileName: string; catalogId: string }> = [];
  const excluded: string[] = [];

  for (const raw of rawAffixes) {
    const affix = raw as RawAffix;
    const fileName = affix.__fileName__;

    // D8: filter to eAffixType === 2 (regular player-rollable affixes only)
    if (affix.eAffixType !== 2) {
      continue;
    }

    // Look up the display label from the per-file string table.
    // For regular affixes the stl typically has "Name_Prefix"/"Name_Suffix" keys.
    // Use "Name_Suffix" as the primary label (e.g. "of Vigor"), falling back to
    // "Name_Prefix" (e.g. "Vigorous"), then the attribute name.
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
    const attributeName = firstAttr.tAttribute.__eAttribute_name__ ?? String(firstAttr.tAttribute.eAttribute);

    // Percent detection (D27) — use attribute name and label
    const { isPercent: isPercentDetected } = detectIsPercent(attributeName, szLabel);
    const isPercent = curationRecord?.isPercent ?? isPercentDetected;

    // Value range: no afValue field in real datamine — use curation record's valueRange.
    // If neither is available, push to needsCuration.
    const curatedRange = curationRecord?.valueRange;
    if (!curatedRange) {
      if (!curationRecord) {
        // Will already be in needsCuration or entries depending on heuristic
        // Only add if not already there
      }
      needsCuration.push({
        bnetFileName: fileName,
        reason: "no-value-range: add valueRange to curation",
      });
      // Don't emit the entry without a value range
      continue;
    }

    const [minVal, maxVal] = curatedRange;

    // Template parsing — use szLabel or attribute name as fallback
    const { labelTemplate } = parseTemplate(szLabel || `{value}`);

    // Slot mapping via integer label intersection
    const rawLabels: number[] = affix.arAllowedItemLabels ?? [];
    const slotRestrictions = mapSlotsFromLabels(rawLabels);

    // Class mapping via fAllowedForPlayerClass bit array
    const classBits: number[] = affix.fAllowedForPlayerClass ?? [];
    const classRestrictions = mapClassesFromBits(classBits);

    // Derive catalogId
    const catalogId =
      curationRecord?.catalogId ?? `affix_${toSnakeCase(fileName)}`;

    // Derive label
    const label = curationRecord?.label ?? szLabel;

    const entry: AffixEntry = {
      id: catalogId,
      label,
      labelTemplate,
      valueRange: [minVal, maxVal],
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

    if (curationRecord?.action === "deprecated") {
      entry.deprecated = true;
    }

    entries.push(entry);
  }

  return { entries, needsCuration, deprecated, excluded };
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
