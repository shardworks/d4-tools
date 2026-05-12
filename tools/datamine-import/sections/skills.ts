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
import { getPowerByFileName } from "../reader";
import { toBnetFileName } from "../file-name";
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
 * v15: Uses `getPowerByFileName(datamineRoot, fileName)` (cached helper in reader.ts)
 * to dereference tPower.__fileName__ → Power JSON and extract scaling attributes,
 * tags, resource cost, and cooldown (D5).
 * Hungarian-prefixed datamine names are normalized to clean identifiers on extraction.
 */
export function transformSkillsForClass(
  skillKit: unknown,
  stringTable: Map<string, string>,
  curation: CurationFile,
  datamineRoot: string
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

    // Real d4data emits `__fileName__` as a full path with extension. Keep the
    // raw form for stringTable + getPowerByFileName (both keyed by full path)
    // and the normalized basename for curation lookups + the output bnetFileName.
    const rawFileName = power.__fileName__;
    const fileName = toBnetFileName(rawFileName);
    const szLabel = stringTable.get(rawFileName) ?? "";

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
    // The cached getPowerByFileName helper (reader.ts, D1/D2/D3) handles directory-walk
    // and per-root memoisation. Hungarian-prefixed datamine field names are normalized:
    //   fScaleValue → scaleValue, nRankScale → rankScale, fResourceCost → resourceCostPerCast,
    //   fCooldownDuration → cooldownSeconds
    let scalingAttributes: SkillScalingAttribute[] | undefined;
    let tags: string[] | undefined;
    let resourceCostPerCast: number | undefined;
    let cooldownSeconds: number | undefined;

    const rawPower = getPowerByFileName(datamineRoot, rawFileName) as RawPower | undefined;
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
      ...(curationRecord?.legacyIds !== undefined ? { legacyIds: curationRecord.legacyIds } : {}),
    };

    entries.push(entry);
  }

  return { entries, needsCuration, deprecated, excluded };
}

/**
 * Transforms skills for all classes from their SkillKit entries.
 * Returns a map of className → TransformerSummary<SkillEntry>.
 *
 * v15: Uses `getPowerByFileName(datamineRoot, fileName)` (cached helper, reader.ts)
 * for D5 Power-file dereferencing. The root is forwarded to each per-class call so
 * the cache is keyed consistently (D3).
 */
export function transformAllSkills(
  skillKits: Map<string, unknown>,
  stringTable: Map<string, string>,
  curation: CurationFile,
  datamineRoot: string
): Record<string, TransformerSummary<SkillEntry>> {
  const result: Record<string, TransformerSummary<SkillEntry>> = {};

  for (const [className, kit] of skillKits) {
    result[className] = transformSkillsForClass(kit, stringTable, curation, datamineRoot);
  }

  return result;
}
