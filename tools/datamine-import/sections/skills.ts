/**
 * Skills section transformer.
 *
 * Transforms raw SkillKit data → SkillEntry[] per class.
 * v15: Dereferences tPower.__fileName__ against the all-powers map to extract
 * scaling attributes, tags, resource cost, and cooldown (D5).
 */

import type { SkillEntry, SkillScalingAttribute } from "../../../lib/catalog/index";
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

interface RawScalingAttribute {
  /** Attribute name (e.g. "Attr_Skill_Damage_Percent") */
  eAttribute: string;
  /** Base damage coefficient (Hungarian: fScaleValue → normalized: scaleValue) */
  fScaleValue: number;
  /** Per-rank coefficient (Hungarian: nRankScale → normalized: rankScale) */
  nRankScale: number;
}

interface RawPower {
  __fileName__: string;
  __snoID__: number;
  ePowerType?: string;
  arScalingAttributes?: RawScalingAttribute[];
  arTagsGranted?: string[];
  /** Resource cost per cast (Hungarian: fResourceCost → normalized: resourceCostPerCast) */
  fResourceCost?: number;
  /** Cooldown in seconds (Hungarian: fCooldownDuration → normalized: cooldownSeconds) */
  fCooldownDuration?: number;
}

// ─── Transformer ──────────────────────────────────────────────────────────────

/**
 * Transforms skills for a single class from its SkillKit entry.
 * Returns a TransformerSummary<SkillEntry> for the given class.
 *
 * v15: Accepts `powersMap` to dereference tPower.__fileName__ → Power JSON
 * and extract scaling attributes, tags, resource cost, and cooldown (D5).
 * Hungarian-prefixed datamine names are normalized to clean identifiers on extraction.
 */
export function transformSkillsForClass(
  skillKit: unknown,
  stringTable: Map<string, string>,
  curation: CurationFile,
  powersMap?: Map<string, unknown>
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

    // v15 (D5): dereference Power file for scaling attributes, tags, resource cost, cooldown.
    // Hungarian-prefixed datamine field names are normalized on extraction:
    //   fScaleValue → scaleValue, nRankScale → rankScale, fResourceCost → resourceCostPerCast,
    //   fCooldownDuration → cooldownSeconds
    let scalingAttributes: SkillScalingAttribute[] | undefined;
    let tags: string[] | undefined;
    let resourceCostPerCast: number | undefined;
    let cooldownSeconds: number | undefined;

    if (powersMap) {
      const rawPower = powersMap.get(fileName) as RawPower | undefined;
      if (rawPower) {
        if (rawPower.arScalingAttributes && rawPower.arScalingAttributes.length > 0) {
          scalingAttributes = rawPower.arScalingAttributes.map((sa) => ({
            attribute: sa.eAttribute,
            scaleValue: sa.fScaleValue,
            rankScale: sa.nRankScale,
          }));
        }
        if (rawPower.arTagsGranted && rawPower.arTagsGranted.length > 0) {
          tags = rawPower.arTagsGranted;
        }
        if (rawPower.fResourceCost !== undefined) {
          resourceCostPerCast = rawPower.fResourceCost;
        }
        if (rawPower.fCooldownDuration !== undefined) {
          cooldownSeconds = rawPower.fCooldownDuration;
        }
      }
    }

    const entry: SkillEntry = {
      id: catalogId,
      label,
      category,
      maxRank,
      bnetId: power.__snoID__,
      bnetFileName: fileName,
      ...(scalingAttributes !== undefined ? { scalingAttributes } : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(resourceCostPerCast !== undefined ? { resourceCostPerCast } : {}),
      ...(cooldownSeconds !== undefined ? { cooldownSeconds } : {}),
    };

    entries.push(entry);
  }

  return { entries, needsCuration, deprecated, excluded };
}

/**
 * Transforms skills for all classes from their SkillKit entries.
 * Returns a map of className → TransformerSummary<SkillEntry>.
 *
 * v15: Accepts optional `powersMap` (indexed by __fileName__) for D5 Power-file dereferencing.
 */
export function transformAllSkills(
  skillKits: Map<string, unknown>,
  stringTable: Map<string, string>,
  curation: CurationFile,
  powersMap?: Map<string, unknown>
): Record<string, TransformerSummary<SkillEntry>> {
  const result: Record<string, TransformerSummary<SkillEntry>> = {};

  for (const [className, kit] of skillKits) {
    result[className] = transformSkillsForClass(kit, stringTable, curation, powersMap);
  }

  return result;
}
