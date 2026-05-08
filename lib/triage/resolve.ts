/**
 * Resolver layer for triage: maps Vision-LLM display-name data → catalog IDs.
 *
 * Algorithm (D9): normalize (lowercase + strip non-alphanumerics + collapse
 * whitespace) then exact match — no Levenshtein, no fuzzy library.
 *
 * Candidate scoping (D9/Reference Material): uses getAffixesForSlotAndClass /
 * getAspectsForSlotAndClass so cross-class affixes never match.
 *
 * Out-of-range values surface as uncertain per D12.
 */

import {
  getAffixesForSlotAndClass,
  getAspectsForSlotAndClass,
  getSlotsForClass,
} from "@/lib/catalog";
import type { AffixEntry, AspectEntry } from "@/lib/catalog";
import itemTypeMappings from "./item-types.json";
import type {
  LlmExtractedItem,
  LlmExtractedAffix,
  LlmExtractedAspect,
  AffixMatchResult,
  AspectMatchResult,
  SlotMatchResult,
  ResolvedItem,
} from "./types";

// ─── Normalization ─────────────────────────────────────────────────────────

/**
 * Normalize a string for comparison: lowercase, strip non-alphanumerics, collapse whitespace.
 * Example: "Maximum Life %" → "maximum life"
 */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Affix resolver ────────────────────────────────────────────────────────

/**
 * Resolves an LLM-extracted affix to a catalog ID.
 * Scopes candidates to the given slot + class before matching (D9/Reference Material).
 */
export function resolveAffix(
  extracted: LlmExtractedAffix,
  slotId: string,
  className: string
): AffixMatchResult {
  const normalizedLabel = normalizeLabel(extracted.label);
  const candidates = getAffixesForSlotAndClass(slotId, className);

  // Find exact-normalized match
  const match = candidates.find(
    (a: AffixEntry) => normalizeLabel(a.label) === normalizedLabel
  );

  if (!match) {
    return {
      kind: "uncertain",
      label: extracted.label,
      rolledValue: extracted.rolledValue,
      reason: "no-match",
    };
  }

  // Check value range (D12)
  const [min, max] = match.valueRange;
  if (extracted.rolledValue < min || extracted.rolledValue > max) {
    return {
      kind: "uncertain",
      label: extracted.label,
      rolledValue: extracted.rolledValue,
      reason: "out-of-range",
      affixId: match.id,
    };
  }

  return {
    kind: "resolved",
    affixId: match.id,
    rolledValue: extracted.rolledValue,
  };
}

// ─── Aspect resolver ───────────────────────────────────────────────────────

/**
 * Resolves an LLM-extracted aspect to a catalog ID.
 * Scopes candidates to the given slot + class before matching.
 * Always emits source = 'legendary' per D11.
 */
export function resolveAspect(
  extracted: LlmExtractedAspect,
  slotId: string,
  className: string
): AspectMatchResult {
  const normalizedLabel = normalizeLabel(extracted.label);
  const candidates = getAspectsForSlotAndClass(slotId, className);

  const match = candidates.find(
    (a: AspectEntry) => normalizeLabel(a.label) === normalizedLabel
  );

  if (!match) {
    return {
      kind: "uncertain",
      label: extracted.label,
      rolledValue: extracted.rolledValue,
      reason: "no-match",
    };
  }

  const [min, max] = match.valueRange;
  if (extracted.rolledValue < min || extracted.rolledValue > max) {
    return {
      kind: "uncertain",
      label: extracted.label,
      rolledValue: extracted.rolledValue,
      reason: "out-of-range",
      aspectId: match.id,
    };
  }

  return {
    kind: "resolved",
    aspectId: match.id,
    rolledValue: extracted.rolledValue,
  };
}

// ─── Slot resolver ─────────────────────────────────────────────────────────

interface ItemTypeMapping {
  types: string[];
  defaultSlots: string[];
  classOverrides: Record<string, string[]>;
  comment?: string;
}

/**
 * Resolves an item type string + class name to a SlotMatchResult.
 *
 * - Exact match (normalized) on item-types.json entries.
 * - Class overrides take precedence over defaultSlots.
 * - Multiple candidates → ambiguous (user picks via SlotPicker).
 * - No eligible slot for the class → incompatible (D20).
 */
export function resolveSlot(itemType: string, className: string): SlotMatchResult {
  const normalizedType = normalizeLabel(itemType);
  const classSlots = getSlotsForClass(className);
  const classSlotIds = new Set(classSlots.map((s) => s.id));

  for (const mapping of itemTypeMappings.mappings as ItemTypeMapping[]) {
    const matched = mapping.types.some((t) => normalizeLabel(t) === normalizedType);
    if (!matched) continue;

    // Determine candidate slot IDs for this class
    const override = mapping.classOverrides[className];
    const rawCandidates = override ?? mapping.defaultSlots;

    // Filter to slots actually available for the class
    const eligible = rawCandidates.filter((slotId) => classSlotIds.has(slotId));

    if (eligible.length === 0) {
      return { kind: "incompatible" };
    }
    if (eligible.length === 1) {
      return { kind: "resolved", slotId: eligible[0] };
    }
    return { kind: "ambiguous", candidates: eligible };
  }

  // No match in item-types.json — treat as incompatible
  return { kind: "incompatible" };
}

// ─── Full item resolver ────────────────────────────────────────────────────

/**
 * Resolves an LlmExtractedItem into a ResolvedItem.
 *
 * When the slot is ambiguous, uses the first candidate for affix/aspect scoping
 * (a reasonable heuristic since affixes are rarely slot-restricted for same-cluster slots).
 * The user must pick the final slot via SlotPicker.
 */
export function resolveItem(extracted: LlmExtractedItem, className: string): ResolvedItem {
  const slotResult = resolveSlot(extracted.itemType, className);

  // Determine which slotId to use for affix scoping
  const scopeSlotId =
    slotResult.kind === "resolved"
      ? slotResult.slotId
      : slotResult.kind === "ambiguous"
        ? slotResult.candidates[0]
        : "helm"; // incompatible — scope doesn't matter, affixes won't resolve cleanly

  const resolveAffixList = (list: LlmExtractedAffix[]) =>
    list.map((a) => resolveAffix(a, scopeSlotId, className));

  return {
    name: extracted.name,
    rarity: extracted.rarity,
    itemPower: extracted.itemPower,
    isAncestral: extracted.isAncestral ?? false,
    implicits: resolveAffixList(extracted.implicits ?? []),
    explicits: resolveAffixList(extracted.explicits ?? []),
    tempered: resolveAffixList(extracted.tempered ?? []),
    aspect: extracted.aspect
      ? resolveAspect(extracted.aspect, scopeSlotId, className)
      : undefined,
    slotResult,
  };
}
