/**
 * Skills section transformer.
 *
 * Transforms raw SkillKit data → SkillEntry[] per class.
 */

import type { SkillEntry } from "../../../lib/catalog/index";
import type { CurationFile } from "../curation";
import { getCurationRecord, applyStrictHeuristics } from "../curation";
import type { TransformerSummary } from "./types";

// ─── Raw datamine shapes ──────────────────────────────────────────────────────

interface RawSkillEntry {
  tPower: {
    __snoID__: number;
    __fileName__: string;
  };
}

interface RawSkillKit {
  __fileName__: string;
  __snoID__: number;
  arActiveSkillEntries: RawSkillEntry[];
}

// ─── Transformer ──────────────────────────────────────────────────────────────

/**
 * Transforms skills for a single class from its SkillKit entry.
 * Returns a TransformerSummary<SkillEntry> for the given class.
 */
export function transformSkillsForClass(
  skillKit: unknown,
  stringTable: Map<string, string>,
  curation: CurationFile
): TransformerSummary<SkillEntry> {
  const entries: SkillEntry[] = [];
  const needsCuration: Array<{ bnetFileName: string; reason: string }> = [];
  const deprecated: Array<{ bnetFileName: string; catalogId: string }> = [];
  const excluded: string[] = [];

  const kit = skillKit as RawSkillKit;
  const skillEntries = kit.arActiveSkillEntries ?? [];

  for (const skillEntry of skillEntries) {
    const power = skillEntry.tPower;
    if (!power) continue;

    const fileName = power.__fileName__;
    const szLabel = stringTable.get(fileName) ?? "";

    // Strict heuristics
    const heuristic = applyStrictHeuristics({ fileName, szLabel });

    // Curation override
    const curationRecord = getCurationRecord(curation, "skills", fileName);

    if (curationRecord) {
      if (curationRecord.action === "exclude") {
        excluded.push(fileName);
        continue;
      }
      if (curationRecord.action === "deprecated") {
        const catalogId = curationRecord.catalogId ?? `skill_${fileName.toLowerCase()}`;
        deprecated.push({ bnetFileName: fileName, catalogId });
      }
    } else if (!heuristic.autoAccept) {
      needsCuration.push({ bnetFileName: fileName, reason: heuristic.reason ?? "unknown" });
      continue;
    } else {
      // No curation record and passes heuristics → still needs curation for category/maxRank
      needsCuration.push({
        bnetFileName: fileName,
        reason: "no curation record: category and maxRank required",
      });
      continue;
    }

    // Skills require category and maxRank from curation
    const category = curationRecord?.category;
    const maxRank = curationRecord?.maxRank;

    if (!category || !maxRank) {
      needsCuration.push({
        bnetFileName: fileName,
        reason: "missing category or maxRank in curation record",
      });
      continue;
    }

    const catalogId = curationRecord?.catalogId ?? `skill_${fileName.toLowerCase()}`;
    const label = curationRecord?.label ?? szLabel;

    const entry: SkillEntry = {
      id: catalogId,
      label,
      category,
      maxRank,
      bnetId: power.__snoID__,
      bnetFileName: fileName,
    };

    entries.push(entry);
  }

  return { entries, needsCuration, deprecated, excluded };
}

/**
 * Transforms skills for all classes from their SkillKit entries.
 * Returns a map of className → TransformerSummary<SkillEntry>.
 */
export function transformAllSkills(
  skillKits: Map<string, unknown>,
  stringTable: Map<string, string>,
  curation: CurationFile
): Record<string, TransformerSummary<SkillEntry>> {
  const result: Record<string, TransformerSummary<SkillEntry>> = {};

  for (const [className, kit] of skillKits) {
    result[className] = transformSkillsForClass(kit, stringTable, curation);
  }

  return result;
}
