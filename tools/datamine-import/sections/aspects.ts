/**
 * Aspect section transformer.
 *
 * Transforms raw datamine Power data (legendary type) → AspectEntry[].
 */

import type { AspectEntry } from "../../../lib/catalog/index";
import type { CurationFile } from "../curation";
import { getCurationRecord, applyStrictHeuristics } from "../curation";
import { SLOT_MAP, BARB_WEAPON_SLOTS, CLASS_MAP } from "../mappings";
import { parseTemplate } from "../template";
import { detectIsPercent, scaleValue } from "../percent";
import type { TransformerSummary } from "./types";

// ─── Helper ───────────────────────────────────────────────────────────────────

function toSnakeCase(s: string): string {
  return s
    .replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`)
    .replace(/^_/, "")
    .replace(/__+/g, "_")
    .toLowerCase();
}

// ─── Raw datamine power shape ─────────────────────────────────────────────────

interface RawPowerAttribute {
  tAttribute: { eAttribute: string; nParam: number };
  afValue: number[];
}

interface RawPower {
  __fileName__: string;
  __snoID__: number;
  ePowerType: string;
  arItemTypesAllowed: string[];
  arClassesAllowed: string[];
  afMagnitude?: number[];
  /** v15: first attribute reference for damage engine routing (D7) */
  ptItemAffixAttributes?: RawPowerAttribute[];
}

// ─── Transformer ──────────────────────────────────────────────────────────────

export function transformAspects(
  rawPowers: unknown[],
  stringTable: Map<string, string>,
  curation: CurationFile
): TransformerSummary<AspectEntry> {
  const entries: AspectEntry[] = [];
  const needsCuration: Array<{ bnetFileName: string; reason: string }> = [];
  const deprecated: Array<{ bnetFileName: string; catalogId: string }> = [];
  const excluded: string[] = [];

  for (const raw of rawPowers) {
    const power = raw as RawPower;
    const fileName = power.__fileName__;

    // Only process legendary aspects
    if (power.ePowerType !== "POWER_TYPE_LEGENDARY") continue;

    const szLabel = stringTable.get(fileName) ?? "";

    // Strict heuristics
    const heuristic = applyStrictHeuristics({ fileName, szLabel });

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

    // Value range from afMagnitude
    const magnitude = power.afMagnitude ?? [0, 0];
    const minVal = magnitude[0] ?? 0;
    const maxVal = magnitude[1] ?? minVal;

    // For aspects, detect percent from label heuristic only
    const { isPercent } = detectIsPercent("", szLabel);

    // Scale if needed (aspects typically use decimal form for percents)
    const scaledMin = scaleValue(minVal, false, "");
    const scaledMax = scaleValue(maxVal, false, "");

    // Template
    const { labelTemplate } = parseTemplate(szLabel || "{value}");

    // Slot mapping
    const rawSlots = power.arItemTypesAllowed ?? [];
    const slotRestrictions = mapSlots(rawSlots);

    // Class mapping
    const rawClasses = power.arClassesAllowed ?? [];
    const classRestrictions = rawClasses
      .map((c) => CLASS_MAP[c])
      .filter(Boolean) as string[];

    const catalogId =
      curationRecord?.catalogId ?? `aspect_${toSnakeCase(fileName)}`;
    const label = curationRecord?.label ?? szLabel;

    // D21: source defaults to "legendary" (conservative). A curation record
    // with source: "codex" overrides this to preserve hand-curated codex
    // aspects across reruns (without this override, all aspects would be
    // re-classified as "legendary" on every run, violating idempotency).
    const aspectSource: "legendary" | "codex" =
      curationRecord?.source ?? "legendary";

    // v15 (D7): optional attribute reference from first ptItemAffixAttributes entry.
    // Mechanical aspects (utility, movement) may not have one — omit-when-absent is
    // legitimate state.
    const firstAttr = power.ptItemAffixAttributes?.[0];
    const attributeRef = firstAttr
      ? { eAttribute: firstAttr.tAttribute.eAttribute, nParam: firstAttr.tAttribute.nParam }
      : undefined;

    // v15 (D16): isDistinctMultiplier set from curation record only — the [×] tag is
    // visible in-game tooltip, not derivable from datamine.
    const isDistinctMultiplier = curationRecord?.isDistinctMultiplier ?? false;

    const entry: AspectEntry = {
      id: catalogId,
      label,
      labelTemplate,
      valueRange: [scaledMin, scaledMax],
      isPercent,
      slotRestrictions,
      classRestrictions,
      source: aspectSource,
      bnetId: power.__snoID__,
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

function mapSlots(rawSlots: string[]): string[] {
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

  if (hasWeapon) {
    for (const barbSlot of BARB_WEAPON_SLOTS) {
      if (!result.includes(barbSlot)) result.push(barbSlot);
    }
  }

  return [...new Set(result)];
}
