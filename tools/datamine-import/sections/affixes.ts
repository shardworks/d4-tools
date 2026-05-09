/**
 * Affix section transformer.
 *
 * Transforms raw datamine affix data → AffixEntry[] with curation applied.
 */

import type { AffixEntry } from "../../../lib/catalog/index";
import type { CurationFile } from "../curation";
import { getCurationRecord, applyStrictHeuristics } from "../curation";
import { SLOT_MAP, BARB_WEAPON_SLOTS, CLASS_MAP } from "../mappings";
import { parseTemplate } from "../template";
import { detectIsPercent, scaleValue } from "../percent";
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

interface RawAffixAttribute {
  tAttribute: { eAttribute: string; nParam: number };
  afValue: number[];
}

interface RawAffix {
  __fileName__: string;
  __snoID__: number;
  eAffixType: string;
  arItemTypesAllowed: string[];
  arClassesAllowed: string[];
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

    // D8: filter to AFFIX_TYPE_REGULAR only
    if (affix.eAffixType !== "AFFIX_TYPE_REGULAR") {
      continue;
    }

    const szLabel = stringTable.get(fileName) ?? "";

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
    const attributeName = firstAttr.tAttribute.eAttribute;
    const afValue = firstAttr.afValue;

    // Percent detection (D27)
    const { isPercent } = detectIsPercent(attributeName, szLabel);

    // Scale values (D19)
    const minVal = scaleValue(afValue[0] ?? 0, isPercent, attributeName);
    const maxVal = scaleValue(afValue[1] ?? afValue[0] ?? 0, isPercent, attributeName);

    // Template parsing
    const { labelTemplate } = parseTemplate(szLabel || `{value}`);

    // Slot mapping
    const rawSlots = affix.arItemTypesAllowed ?? [];
    const slotRestrictions = mapSlots(rawSlots, fileName);

    // Class mapping
    const rawClasses = affix.arClassesAllowed ?? [];
    const classRestrictions = rawClasses
      .map((c) => CLASS_MAP[c])
      .filter(Boolean) as string[];

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
    };

    if (curationRecord?.action === "deprecated") {
      entry.deprecated = true;
    }

    entries.push(entry);
  }

  return { entries, needsCuration, deprecated, excluded };
}

/**
 * Maps datamine slot keys → catalog slot IDs.
 * RING → both ring1 and ring2.
 * WEAPON → barb weapon fan-out included (as additional slots).
 */
function mapSlots(rawSlots: string[], _fileName: string): string[] {
  if (rawSlots.length === 0) return [];

  const result: string[] = [];
  let hasWeapon = false;

  for (const raw of rawSlots) {
    if (raw === "RING") {
      result.push("ring1", "ring2");
    } else if (raw === "WEAPON") {
      hasWeapon = true;
      result.push("weapon");
    } else {
      const mapped = SLOT_MAP[raw];
      if (mapped) result.push(mapped);
    }
  }

  // D16: barb weapon fan-out for weapon-slot affixes
  if (hasWeapon) {
    for (const barbSlot of BARB_WEAPON_SLOTS) {
      if (!result.includes(barbSlot)) {
        result.push(barbSlot);
      }
    }
  }

  return [...new Set(result)];
}
