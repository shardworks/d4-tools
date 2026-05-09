/**
 * Uniques section transformer.
 *
 * Transforms raw datamine Item data → UniqueEntry[].
 */

import type { UniqueEntry } from "../../../lib/catalog/index";
import type { CurationFile } from "../curation";
import { getCurationRecord, applyStrictHeuristics } from "../curation";
import { CLASS_MAP } from "../mappings";
import type { TransformerSummary } from "./types";

// ─── Helper ───────────────────────────────────────────────────────────────────

function toSnakeCase(s: string): string {
  return s
    .replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`)
    .replace(/^_/, "")
    .replace(/__+/g, "_")
    .toLowerCase();
}

/** Maps datamine item type string to a slot id */
function itemTypeToSlot(eItemType: string): string {
  const lower = eItemType.toLowerCase();
  if (lower.includes("helm") || lower.includes("head")) return "helm";
  if (lower.includes("chest") || lower.includes("torso")) return "chest";
  if (lower.includes("gloves") || lower.includes("hand")) return "gloves";
  if (lower.includes("pants") || lower.includes("legs")) return "pants";
  if (lower.includes("boots") || lower.includes("feet")) return "boots";
  if (lower.includes("amulet") || lower.includes("neck")) return "amulet";
  if (lower.includes("ring")) return "ring1";
  if (lower.includes("offhand") || lower.includes("shield") || lower.includes("focus") || lower.includes("totem")) return "offHand";
  if (lower.includes("sword") || lower.includes("axe") || lower.includes("mace") || lower.includes("spear")
    || lower.includes("staff") || lower.includes("bow") || lower.includes("crossbow")
    || lower.includes("wand") || lower.includes("dagger") || lower.includes("scythe")
    || lower.includes("flail") || lower.includes("polearm") || lower.includes("two_hand")) return "weapon";
  return "weapon"; // fallback
}

// ─── Raw datamine item shape ──────────────────────────────────────────────────

interface RawItem {
  __fileName__: string;
  __snoID__: number;
  eItemType: string;
  eQualityLevel: string;
  arClassesAllowed: string[];
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

    // Filter to unique quality items
    if (
      !item.eQualityLevel?.includes("UNIQUE") &&
      !item.eQualityLevel?.includes("MYTHIC")
    ) {
      continue;
    }

    const szLabel = stringTable.get(fileName) ?? "";

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

    const slot = itemTypeToSlot(item.eItemType ?? "");

    const rawClasses = item.arClassesAllowed ?? [];
    const classRestrictions = rawClasses
      .map((c) => CLASS_MAP[c])
      .filter(Boolean) as string[];

    const catalogId =
      curationRecord?.catalogId ?? `unique_${toSnakeCase(fileName)}`;
    const label = curationRecord?.label ?? szLabel;

    const entry: UniqueEntry = {
      id: catalogId,
      label,
      slot,
      classRestrictions,
      bnetId: item.__snoID__,
      bnetFileName: fileName,
    };

    if (curationRecord?.action === "deprecated") {
      entry.deprecated = true;
    }

    entries.push(entry);
  }

  return { entries, needsCuration, deprecated, excluded };
}
