/**
 * Aspect section transformer.
 *
 * Transforms raw datamine Affix data (eAffixType === 1, legendary) → AspectEntry[].
 *
 * Actual datamine format (DiabloTools/d4data):
 *   Legendary aspects are in Affix files (json/base/meta/Affix/*.aff.json) with
 *   eAffixType === 1. Power files do NOT have ePowerType and are NOT used for aspects.
 *
 * File name filters for true legendary aspects (skip intrinsics / tempered / unique powers):
 *   - Exclude filenames starting with: Talisman_, UNIQUE_, UBERUNIQUE_, Tempered_
 *   - Include filenames starting with: legendary_, Legendary_, S{N}_legendary_, S{N}_Legendary_
 */

import type { AspectEntry } from "../../../lib/catalog/index";
import type { CurationFile } from "../curation";
import { getCurationRecord, applyStrictHeuristics } from "../curation";
import { LABEL_TO_SLOTS, AFFIX_CLASS_ORDER } from "../mappings";
import { parseTemplate } from "../template";
import { detectIsPercent } from "../percent";
import { toBnetFileName } from "../file-name";
import type { TransformerSummary } from "./types";

// ─── Helper ───────────────────────────────────────────────────────────────────

function toSnakeCase(s: string): string {
  return s
    .replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`)
    .replace(/^_/, "")
    .replace(/__+/g, "_")
    .toLowerCase();
}

/** Returns true if the affix filename looks like a legendary aspect (not a unique power / tempered / charm). */
function isLegendaryAspectFileName(fileName: string): boolean {
  // Extract just the basename (last path segment, no extension)
  const parts = fileName.split("/");
  const base = parts[parts.length - 1].replace(/\.aff$/, "");

  // Exclusions
  if (base.startsWith("Talisman_")) return false;
  if (base.startsWith("UNIQUE_")) return false;
  if (base.startsWith("UBERUNIQUE_")) return false;
  if (base.startsWith("Tempered_")) return false;
  // Unique-item affixes stored in the affix folder with item-type prefix are not codex aspects
  // (e.g. "1HAxe_Unique_Druid_100", "Helm_Unique_Generic_001")
  if (/^[0-9A-Z].*_Unique_/.test(base)) return false;

  // Inclusions — must start with legendary_ / Legendary_ or season variants S{N}_legendary_
  if (/^legendary_/i.test(base)) return true;
  if (/^S\d+_legendary_/i.test(base)) return true;

  return false;
}

// ─── Raw datamine affix shape (legendary aspects share the AffixDefinition schema) ─

interface RawAffixAttributeSpec {
  eAttribute: number;
  __eAttribute_name__?: string;
  nParam: number;
}

interface RawAffixAttribute {
  tAttribute: RawAffixAttributeSpec;
}

interface RawLegendaryAffix {
  __fileName__: string;
  __snoID__: number;
  eAffixType: number;
  arAllowedItemLabels: number[];
  fAllowedForPlayerClass: number[];
  ptItemAffixAttributes?: RawAffixAttribute[];
}

// ─── Transformer ──────────────────────────────────────────────────────────────

/**
 * Transforms legendary affix entries (eAffixType === 1) → AspectEntry[].
 *
 * @param rawAffixes  All affix entries (pre-filtered to eAffixType===1 by loadAspects,
 *                    but we also accept the full array and re-filter here for safety).
 * @param stringTable Flat string table from loadStringTable().
 *                    Per-label keys accessed as: fileName + "::" + szLabel
 * @param curation    Curation file for overrides.
 */
export function transformAspects(
  rawAffixes: unknown[],
  stringTable: Map<string, string>,
  curation: CurationFile
): TransformerSummary<AspectEntry> {
  const entries: AspectEntry[] = [];
  const needsCuration: Array<{ bnetFileName: string; reason: string }> = [];
  const deprecated: Array<{ bnetFileName: string; catalogId: string }> = [];
  const excluded: string[] = [];

  for (const raw of rawAffixes) {
    const affix = raw as RawLegendaryAffix;
    // Real d4data emits `__fileName__` as a full path with extension. The
    // catalog's `bnetFileName`, every curation key, and every downstream
    // consumer use the basename only. Keep the raw form for stringTable
    // lookups (which are keyed by full path) and the normalized form for
    // curation lookups, filename-pattern matching, and the output bnetFileName.
    const rawFileName = affix.__fileName__;
    const fileName = toBnetFileName(rawFileName);

    // Filter to legendary aspects only (eAffixType === 1)
    if (affix.eAffixType !== 1) continue;

    // Filter by filename pattern — skip unique powers, tempered, charm affixes.
    // The pattern matcher already strips leading path components but is robust
    // against either form; pass the normalized basename for clarity.
    if (!isLegendaryAspectFileName(fileName)) continue;

    // Get description from per-file string table.
    // Prefer "Desc" key; fall back to "CodexDesc".
    const desc = stringTable.get(`${rawFileName}::Desc`)
      ?? stringTable.get(`${rawFileName}::CodexDesc`)
      ?? "";
    // Name is "of [Something]" — strip "of " prefix to get the aspect name.
    const nameRaw = stringTable.get(`${rawFileName}::Name`) ?? "";
    const szLabel = desc;

    // Strict heuristics — use the desc as szLabel for WIP detection
    const heuristic = applyStrictHeuristics({ fileName, szLabel: desc });

    // Curation override
    const curationRecord = getCurationRecord(curation, "aspects", fileName);

    if (curationRecord) {
      if (curationRecord.action === "exclude") {
        excluded.push(fileName);
        continue;
      }
      if (curationRecord.action === "deprecated") {
        const catalogId = curationRecord.catalogId ?? `aspect_${toSnakeCase(fileName)}`;
        deprecated.push({ bnetFileName: fileName, catalogId });
      }
    } else if (!heuristic.autoAccept) {
      needsCuration.push({ bnetFileName: fileName, reason: heuristic.reason ?? "unknown" });
      continue;
    }

    // Value range: no afValue in datamine — require curation record's valueRange.
    const curatedRange = curationRecord?.valueRange;
    if (!curatedRange) {
      needsCuration.push({
        bnetFileName: fileName,
        reason: "no-value-range: add valueRange to curation",
      });
      continue;
    }

    const [minVal, maxVal] = curatedRange;

    // Percent detection from label heuristic
    const { isPercent: isPercentDetected } = detectIsPercent("", desc);
    const isPercent = curationRecord?.isPercent ?? isPercentDetected;

    // Template
    const { labelTemplate } = parseTemplate(desc || "{value}");

    // Slot mapping via integer label intersection
    const rawLabels: number[] = affix.arAllowedItemLabels ?? [];
    const slotRestrictions = mapSlotsFromLabels(rawLabels);

    // Class mapping via fAllowedForPlayerClass bit array
    const classBits: number[] = affix.fAllowedForPlayerClass ?? [];
    const classRestrictions = mapClassesFromBits(classBits);

    const catalogId =
      curationRecord?.catalogId ?? `aspect_${toSnakeCase(fileName)}`;

    // Derive label: prefer curation override, then "Name" field (strip "of " prefix),
    // then fall back to catalogId.
    const aspectName = nameRaw.startsWith("of ")
      ? nameRaw.slice(3)
      : nameRaw;
    const label = curationRecord?.label ?? (aspectName || catalogId);

    // D21: source defaults to "legendary" (conservative). A curation record
    // with source: "codex" overrides this to preserve hand-curated codex
    // aspects across reruns (without this override, all aspects would be
    // re-classified as "legendary" on every run, violating idempotency).
    const aspectSource: "legendary" | "codex" =
      curationRecord?.source ?? "legendary";

    // v15 (D7): optional attribute reference from first ptItemAffixAttributes entry.
    const firstAttr = affix.ptItemAffixAttributes?.[0];
    const attributeName = firstAttr?.tAttribute.__eAttribute_name__
      ?? (firstAttr ? String(firstAttr.tAttribute.eAttribute) : undefined);
    const attributeRef = firstAttr
      ? { eAttribute: attributeName ?? String(firstAttr.tAttribute.eAttribute), nParam: firstAttr.tAttribute.nParam }
      : undefined;

    // v15 (D16): isDistinctMultiplier set from curation record only — the [×] tag is
    // visible in-game tooltip, not derivable from datamine.
    const isDistinctMultiplier = curationRecord?.isDistinctMultiplier ?? false;

    const entry: AspectEntry = {
      id: catalogId,
      label,
      labelTemplate,
      valueRange: [minVal, maxVal],
      isPercent,
      slotRestrictions,
      classRestrictions,
      source: aspectSource,
      bnetId: affix.__snoID__,
      bnetFileName: fileName,
      ...(attributeRef !== undefined ? { attribute: attributeRef } : {}),
      isDistinctMultiplier,
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
  }

  return [...result];
}

/**
 * Maps fAllowedForPlayerClass bit array → class name array per AFFIX_CLASS_ORDER.
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
