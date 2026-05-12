/**
 * Deterministic JSON serializer for catalog entries.
 *
 * Each serialize* function returns an object with keys in canonical schema order.
 * Optional fields are omitted when falsy.
 */

import type {
  AffixEntry,
  AspectEntry,
  SkillEntry,
  ParagonBoardEntry,
  ParagonGlyphEntry,
} from "../../lib/catalog/index";
import type { UniqueEntry } from "../../lib/catalog/index";

// ─── Serializers ──────────────────────────────────────────────────────────────

export function serializeAffix(entry: AffixEntry): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: entry.id,
    label: entry.label,
    labelTemplate: entry.labelTemplate,
    valueRanges: entry.valueRanges,
    isPercent: entry.isPercent,
    slotRestrictions: entry.slotRestrictions,
    classRestrictions: entry.classRestrictions,
  };
  if (entry.bnetId !== undefined) obj.bnetId = entry.bnetId;
  if (entry.bnetFileName !== undefined) obj.bnetFileName = entry.bnetFileName;
  if (entry.deprecated) obj.deprecated = true;
  // v15 (D6): attribute reference for damage engine bucket routing
  if (entry.attribute !== undefined) obj.attribute = entry.attribute;
  // v18: implicit flag — omit when false/undefined (most affixes are explicit)
  if (entry.isImplicit) obj.isImplicit = true;
  // v19 (D2): weapon speed class — omit on all non-weapon-damage affixes
  if (entry.weaponSpeedClass !== undefined) obj.weaponSpeedClass = entry.weaponSpeedClass;
  return obj;
}

export function serializeAspect(entry: AspectEntry): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: entry.id,
    label: entry.label,
    labelTemplate: entry.labelTemplate,
    valueRange: entry.valueRange,
    isPercent: entry.isPercent,
    slotRestrictions: entry.slotRestrictions,
    classRestrictions: entry.classRestrictions,
    source: entry.source,
  };
  if (entry.bnetId !== undefined) obj.bnetId = entry.bnetId;
  if (entry.bnetFileName !== undefined) obj.bnetFileName = entry.bnetFileName;
  if (entry.deprecated) obj.deprecated = true;
  // v15 (D7, D16): optional attribute reference + distinct-multiplier flag
  if (entry.attribute !== undefined) obj.attribute = entry.attribute;
  if (entry.isDistinctMultiplier) obj.isDistinctMultiplier = true;
  return obj;
}

export function serializeUnique(entry: UniqueEntry): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: entry.id,
    label: entry.label,
    slot: entry.slot,
    classRestrictions: entry.classRestrictions,
  };
  if (entry.bnetId !== undefined) obj.bnetId = entry.bnetId;
  if (entry.bnetFileName !== undefined) obj.bnetFileName = entry.bnetFileName;
  if (entry.deprecated) obj.deprecated = true;
  // v15 (D8): intrinsic affix attribute references for unique items
  if (entry.intrinsicAffixes && entry.intrinsicAffixes.length > 0) {
    obj.intrinsicAffixes = entry.intrinsicAffixes;
  }
  return obj;
}

export function serializeSkill(entry: SkillEntry): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: entry.id,
    label: entry.label,
    category: entry.category,
    maxRank: entry.maxRank,
  };
  if (entry.bnetFileName !== undefined) obj.bnetFileName = entry.bnetFileName;
  if (entry.bnetId !== undefined) obj.bnetId = entry.bnetId;
  // v15 (D5): scaling attributes, tags, resource cost, cooldown
  if (entry.scalingAttributes !== undefined) obj.scalingAttributes = entry.scalingAttributes;
  if (entry.tags !== undefined) obj.tags = entry.tags;
  if (entry.resourceCostPerCast !== undefined) obj.resourceCostPerCast = entry.resourceCostPerCast;
  if (entry.cooldownSeconds !== undefined) obj.cooldownSeconds = entry.cooldownSeconds;
  // legacyIds: omit when absent or empty so non-renamed entries stay clean
  if (entry.legacyIds !== undefined && entry.legacyIds.length > 0) {
    obj.legacyIds = entry.legacyIds;
  }
  return obj;
}

export function serializeBoard(
  entry: ParagonBoardEntry
): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: entry.id,
    label: entry.label,
  };
  if (entry.isStarterBoard) obj.isStarterBoard = true;
  if (entry.bnetFileName !== undefined) obj.bnetFileName = entry.bnetFileName;
  if (entry.bnetId !== undefined) obj.bnetId = entry.bnetId;
  // legacyIds: omit when absent or empty so non-renamed entries stay clean
  if (entry.legacyIds !== undefined && entry.legacyIds.length > 0) {
    obj.legacyIds = entry.legacyIds;
  }
  return obj;
}

export function serializeGlyph(
  entry: ParagonGlyphEntry
): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: entry.id,
    label: entry.label,
  };
  if (entry.bnetFileName !== undefined) obj.bnetFileName = entry.bnetFileName;
  if (entry.bnetId !== undefined) obj.bnetId = entry.bnetId;
  // legacyIds: omit when absent or empty so non-renamed entries stay clean
  if (entry.legacyIds !== undefined && entry.legacyIds.length > 0) {
    obj.legacyIds = entry.legacyIds;
  }
  return obj;
}

// ─── Sort helper ──────────────────────────────────────────────────────────────

export function sortByBnetFileName<T extends { bnetFileName?: string; id: string }>(
  entries: T[]
): T[] {
  return [...entries].sort((a, b) => {
    const ka = a.bnetFileName ?? a.id;
    const kb = b.bnetFileName ?? b.id;
    return ka.localeCompare(kb);
  });
}

// ─── JSON serializer ──────────────────────────────────────────────────────────

export function toJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + "\n";
}
