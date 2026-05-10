/**
 * Uniques section transformer.
 *
 * Transforms raw datamine Item data → UniqueEntry[].
 *
 * Actual datamine format (DiabloTools/d4data):
 *   eMagicType === 2 for unique items (not eQualityLevel)
 *   snoItemType.name for the slot (e.g. "Helm", "ChestArmor", "Axe")
 *   fUsableByClass: number[] — class restriction bit array per AFFIX_CLASS_ORDER
 *   Name from: Item_{basename}.stl.json with "Name" szLabel
 */

import type { UniqueEntry } from "../../../lib/catalog/index";
import type { CurationFile } from "../curation";
import { getCurationRecord, applyStrictHeuristics } from "../curation";
import { AFFIX_CLASS_ORDER } from "../mappings";
import type { TransformerSummary } from "./types";

// ─── Helper ───────────────────────────────────────────────────────────────────

function toSnakeCase(s: string): string {
  return s
    .replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`)
    .replace(/^_/, "")
    .replace(/__+/g, "_")
    .toLowerCase();
}

/**
 * Maps snoItemType.name → catalog slot id.
 * snoItemType.name comes from the base/meta/ItemType/*.itt file basename.
 */
function itemTypeNameToSlot(name: string): string {
  const lower = name.toLowerCase();
  if (lower === "helm" || lower.includes("head")) return "helm";
  if (lower === "chestarmor" || lower === "chest" || lower.includes("torso")) return "chest";
  if (lower === "gloves" || lower.includes("hand")) return "gloves";
  if (lower === "pants" || lower === "legs" || lower.includes("legs")) return "pants";
  if (lower === "boots" || lower.includes("feet")) return "boots";
  if (lower === "amulet" || lower.includes("neck")) return "amulet";
  if (lower === "ring") return "ring1";
  if (lower === "shield" || lower === "focus" || lower === "offhandtotem"
    || lower.includes("offhand") || lower.includes("totem")) return "offHand";
  // Weapon types
  if (lower === "axe" || lower === "1haxe" || lower === "2haxe") return "weapon";
  if (lower === "sword" || lower === "1hsword" || lower === "2hsword") return "weapon";
  if (lower === "mace" || lower === "1hmace" || lower === "2hmace" || lower === "flail" || lower === "1hflail") return "weapon";
  if (lower === "dagger" || lower === "1hdagger") return "weapon";
  if (lower === "polearm" || lower === "2hpolearm") return "weapon";
  if (lower === "staff" || lower === "2hstaff") return "weapon";
  if (lower === "bow" || lower === "2hbow") return "weapon";
  if (lower === "crossbow2h" || lower.includes("crossbow")) return "weapon";
  if (lower === "scythe" || lower === "1hscythe" || lower === "2hscythe") return "weapon";
  if (lower.includes("wand")) return "weapon";
  if (lower.includes("sword") || lower.includes("axe") || lower.includes("mace")
    || lower.includes("spear") || lower.includes("staff") || lower.includes("bow")
    || lower.includes("dagger") || lower.includes("scythe") || lower.includes("polearm")
    || lower.includes("two_hand") || lower.includes("2h")) return "weapon";
  return "weapon"; // fallback
}

// ─── Raw datamine item shape ──────────────────────────────────────────────────

interface RawItemSnoItemType {
  name: string;
}

interface RawItemAffixAttributeSpec {
  eAttribute: number;
  __eAttribute_name__?: string;
  nParam: number;
}

interface RawItemAffixAttribute {
  tAttribute: RawItemAffixAttributeSpec;
  /** afValue does not exist in real datamine — omit from type */
}

interface RawItem {
  __fileName__: string;
  __snoID__: number;
  /** eMagicType === 2 for unique items */
  eMagicType: number;
  snoItemType: RawItemSnoItemType;
  /** fUsableByClass: class restriction bit array (same order as AFFIX_CLASS_ORDER) */
  fUsableByClass: number[];
  /**
   * v15 (D8): Intrinsic affix attributes for unique item powers.
   * No afValue field in real datamine.
   */
  ptItemAffixAttributes?: RawItemAffixAttribute[];
}

// ─── Transformer ──────────────────────────────────────────────────────────────

export function transformUniques(
  rawItems: unknown[],
  stringTable: Map<string, string>,
  curation: CurationFile
): TransformerSummary<UniqueEntry> {
  const entries: UniqueEntry[] = [];
  const needsCuration: Array<{ bnetFileName: string; reason: string }> = [];
  const deprecated: Array<{ bnetFileName: string; catalogId: string }> = [];
  const excluded: string[] = [];

  for (const raw of rawItems) {
    const item = raw as RawItem;
    const fileName = item.__fileName__;

    // Filter to unique quality items: eMagicType === 2
    if (item.eMagicType !== 2) {
      continue;
    }

    // Get name from per-file string table using "Name" szLabel
    const szLabel = stringTable.get(`${fileName}::Name`) ?? "";

    // Strict heuristics
    const heuristic = applyStrictHeuristics({ fileName, szLabel });

    // Curation override
    const curationRecord = getCurationRecord(curation, "uniques", fileName);

    if (curationRecord) {
      if (curationRecord.action === "exclude") {
        excluded.push(fileName);
        continue;
      }
      if (curationRecord.action === "deprecated") {
        const catalogId = curationRecord.catalogId ?? `unique_${toSnakeCase(fileName)}`;
        deprecated.push({ bnetFileName: fileName, catalogId });
      }
    } else if (!heuristic.autoAccept) {
      needsCuration.push({ bnetFileName: fileName, reason: heuristic.reason ?? "unknown" });
      continue;
    }

    // Slot from snoItemType.name
    const slot = itemTypeNameToSlot(item.snoItemType?.name ?? "");

    // Class mapping via fUsableByClass bit array
    const classBits: number[] = item.fUsableByClass ?? [];
    const classRestrictions = mapClassesFromBits(classBits);

    const catalogId =
      curationRecord?.catalogId ?? `unique_${toSnakeCase(fileName)}`;
    const label = curationRecord?.label ?? szLabel;

    // v15 (D8): extract intrinsic-affix attribute references from the datamine.
    // Note: afValue does not exist in real datamine; omit valueRange from intrinsicAffixes.
    const intrinsicAffixes: UniqueEntry["intrinsicAffixes"] = [];
    for (const attr of item.ptItemAffixAttributes ?? []) {
      const attrName = attr.tAttribute.__eAttribute_name__
        ?? String(attr.tAttribute.eAttribute);
      intrinsicAffixes.push({
        attribute: {
          eAttribute: attrName,
          nParam: attr.tAttribute.nParam,
        },
        valueRange: [0, 0],
      });
    }

    const entry: UniqueEntry = {
      id: catalogId,
      label,
      slot,
      classRestrictions,
      bnetId: item.__snoID__,
      bnetFileName: fileName,
      ...(intrinsicAffixes.length > 0 ? { intrinsicAffixes } : {}),
    };

    if (curationRecord?.action === "deprecated") {
      entry.deprecated = true;
    }

    entries.push(entry);
  }

  return { entries, needsCuration, deprecated, excluded };
}

/**
 * Maps fUsableByClass bit array → class name array per AFFIX_CLASS_ORDER.
 * Returns [] if all zeros (unrestricted) or all flags set (unrestricted).
 */
function mapClassesFromBits(bits: number[]): string[] {
  if (bits.length === 0) return [];

  const allZero = bits.every((b) => b === 0);
  if (allZero) return [];

  const result: string[] = [];
  for (let i = 0; i < bits.length && i < AFFIX_CLASS_ORDER.length; i++) {
    if (bits[i]) {
      result.push(AFFIX_CLASS_ORDER[i]);
    }
  }

  if (result.length === AFFIX_CLASS_ORDER.length) return [];

  return result;
}
