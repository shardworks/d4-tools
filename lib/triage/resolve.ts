/**
 * Resolver layer for triage: maps Vision-LLM display-name data → catalog IDs.
 *
 * Algorithm (v17 / D2–D7 / D16):
 *  1. Normalize (lowercase + strip non-alphanumerics + collapse whitespace).
 *  2. Synonym expansion — check synonyms.json for a canonical normalized alias.
 *  3. Jaro-Winkler fuzzy scoring against all class/slot-scoped catalog candidates.
 *  4. Threshold checks:
 *     - Score ≥ NEAR_PERFECT_THRESHOLD (0.97) → treat as definitive single match.
 *     - Score ≥ FUZZY_THRESHOLD (0.82):
 *       - Multiple candidates → "ambiguous" reason with candidates[] (D5).
 *       - Single candidate → proceed to value-range check.
 *  5. Value-format auto-correct: if isPercent and rolledValue ∈ (0,1],
 *     multiply by 100 and re-check range → "value-mismatch" reason (D4).
 *  6. resolveUnique() short-circuit fires first when rarity ∈ {unique, mythic}
 *     and the item name normalizes to a UniqueEntry (D16).
 *
 * Candidate scoping still uses getAffixesForSlotAndClass / getAspectsForSlotAndClass
 * so cross-class entries never pollute the candidate pool.
 *
 * No external fuzzy library — Jaro-Winkler is implemented in-house (D2).
 */

import {
  getAffixesForSlotAndClass,
  getAspectsForSlotAndClass,
  getSlotsForClass,
  uniques,
} from "@/lib/catalog";
import type { AffixEntry, AspectEntry, UniqueEntry } from "@/lib/catalog";
import itemTypeMappings from "./item-types.json";
import synonymsData from "./synonyms.json";
import type {
  LlmExtractedItem,
  LlmExtractedAffix,
  LlmExtractedAspect,
  AffixMatchResult,
  AspectMatchResult,
  SlotMatchResult,
  ResolvedItem,
} from "./types";

// ─── Fuzzy matching config ─────────────────────────────────────────────────

/**
 * Minimum Jaro-Winkler score to consider any candidate.
 * Scores below this → "no-match".
 */
const FUZZY_THRESHOLD = 0.82;

/**
 * Scores at or above this are treated as a definitive single match,
 * even when other candidates exceed FUZZY_THRESHOLD.
 * In practice, normalized exact matches always score 1.0. Single-char typos
 * on strings of ≥10 characters typically score 0.96+.
 */
const NEAR_PERFECT_THRESHOLD = 0.96;

/**
 * Maximum number of candidates to include in an "ambiguous" result.
 */
const MAX_AMBIG_CANDIDATES = 5;

// ─── In-house Jaro-Winkler (D2) ──────────────────────────────────────────

/**
 * Jaro similarity between two strings.
 * Returns 0 if either string is empty (with 0-length both strings return 1).
 */
function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);
  const s1Matches = new Uint8Array(len1);
  const s2Matches = new Uint8Array(len2);

  let matches = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = 1;
      s2Matches[j] = 1;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
  );
}

/**
 * Jaro-Winkler similarity. Adds a prefix bonus (weight p=0.1) for shared
 * leading characters (up to 4). Returns a value in [0, 1].
 */
export function jaroWinkler(s1: string, s2: string, p = 0.1): number {
  const jaroScore = jaro(s1, s2);
  let prefixLen = 0;
  const maxPrefix = Math.min(s1.length, s2.length, 4);
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefixLen++;
    else break;
  }
  return jaroScore + prefixLen * p * (1 - jaroScore);
}

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

// ─── Synonym expansion ─────────────────────────────────────────────────────

const affixSynonyms = synonymsData.affix_aliases as Record<string, string>;
const aspectSynonyms = synonymsData.aspect_aliases as Record<string, string>;

function expandAffix(normalized: string): string {
  return affixSynonyms[normalized] ?? normalized;
}

function expandAspect(normalized: string): string {
  return aspectSynonyms[normalized] ?? normalized;
}

// ─── Scored matching ───────────────────────────────────────────────────────

interface ScoredEntry<T> {
  entry: T;
  score: number;
}

function scoreEntries<T extends { label: string }>(
  query: string,
  entries: T[]
): ScoredEntry<T>[] {
  return entries
    .map((e) => ({ entry: e, score: jaroWinkler(query, normalizeLabel(e.label)) }))
    .filter((s) => s.score >= FUZZY_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

// ─── Value-format auto-correct (D4) ───────────────────────────────────────

/**
 * Applies unit-aware auto-correction for percent values.
 * When isPercent is true and the rolled value is in (0, 1], returns the corrected
 * value (× 100); otherwise returns null.
 */
function tryPercentCorrect(isPercent: boolean, value: number): number | null {
  if (isPercent && value > 0 && value <= 1) {
    return Math.round(value * 100 * 1000) / 1000; // avoid float drift
  }
  return null;
}

// ─── Affix resolver ────────────────────────────────────────────────────────

/**
 * Resolves an LLM-extracted affix to a catalog ID using synonym expansion and
 * Jaro-Winkler fuzzy matching.
 *
 * Reason taxonomy (D7):
 *  - "resolved"      : single confident match within value range.
 *  - "value-mismatch": matched but value looks like wrong unit (D4).
 *  - "out-of-range"  : matched but rolled value outside [min, max].
 *  - "ambiguous"     : multiple candidates above FUZZY_THRESHOLD (D5).
 *  - "no-match"      : no candidate above FUZZY_THRESHOLD.
 */
export function resolveAffix(
  extracted: LlmExtractedAffix,
  slotId: string,
  className: string
): AffixMatchResult {
  const normalizedLabel = normalizeLabel(extracted.label);
  const canonical = expandAffix(normalizedLabel);
  const candidates = getAffixesForSlotAndClass(slotId, className);

  const scored = scoreEntries(canonical, candidates);

  if (scored.length === 0) {
    return {
      kind: "uncertain",
      label: extracted.label,
      rolledValue: extracted.rolledValue,
      reason: "no-match",
    };
  }

  // Ambiguity check: if top score is below near-perfect AND multiple candidates exceed threshold
  if (scored[0].score < NEAR_PERFECT_THRESHOLD && scored.length >= 2) {
    return {
      kind: "uncertain",
      label: extracted.label,
      rolledValue: extracted.rolledValue,
      reason: "ambiguous",
      candidates: scored.slice(0, MAX_AMBIG_CANDIDATES).map((s) => s.entry.id),
    };
  }

  const match = scored[0].entry as AffixEntry;
  const [min, max] = match.valueRange;
  const { rolledValue } = extracted;

  // Value-format auto-correct (D4): isPercent + value ∈ (0, 1] → try × 100
  const corrected = tryPercentCorrect(match.isPercent, rolledValue);
  if (corrected !== null && corrected >= min && corrected <= max) {
    return {
      kind: "uncertain",
      label: extracted.label,
      rolledValue,
      reason: "value-mismatch",
      affixId: match.id,
      unitCorrected: corrected,
    };
  }

  // Range check
  if (rolledValue < min || rolledValue > max) {
    return {
      kind: "uncertain",
      label: extracted.label,
      rolledValue,
      reason: "out-of-range",
      affixId: match.id,
    };
  }

  return {
    kind: "resolved",
    affixId: match.id,
    rolledValue,
  };
}

// ─── Aspect resolver ───────────────────────────────────────────────────────

/**
 * Resolves an LLM-extracted aspect to a catalog ID using synonym expansion and
 * Jaro-Winkler fuzzy matching. Same reason taxonomy as resolveAffix.
 */
export function resolveAspect(
  extracted: LlmExtractedAspect,
  slotId: string,
  className: string
): AspectMatchResult {
  const normalizedLabel = normalizeLabel(extracted.label);
  const canonical = expandAspect(normalizedLabel);
  const candidates = getAspectsForSlotAndClass(slotId, className);

  const scored = scoreEntries(canonical, candidates);

  if (scored.length === 0) {
    return {
      kind: "uncertain",
      label: extracted.label,
      rolledValue: extracted.rolledValue,
      reason: "no-match",
    };
  }

  if (scored[0].score < NEAR_PERFECT_THRESHOLD && scored.length >= 2) {
    return {
      kind: "uncertain",
      label: extracted.label,
      rolledValue: extracted.rolledValue,
      reason: "ambiguous",
      candidates: scored.slice(0, MAX_AMBIG_CANDIDATES).map((s) => s.entry.id),
    };
  }

  const match = scored[0].entry as AspectEntry;
  const [min, max] = match.valueRange;
  const { rolledValue } = extracted;

  const corrected = tryPercentCorrect(match.isPercent, rolledValue);
  if (corrected !== null && corrected >= min && corrected <= max) {
    return {
      kind: "uncertain",
      label: extracted.label,
      rolledValue,
      reason: "value-mismatch",
      aspectId: match.id,
      unitCorrected: corrected,
    };
  }

  if (rolledValue < min || rolledValue > max) {
    return {
      kind: "uncertain",
      label: extracted.label,
      rolledValue,
      reason: "out-of-range",
      aspectId: match.id,
    };
  }

  return {
    kind: "resolved",
    aspectId: match.id,
    rolledValue,
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

    const override = mapping.classOverrides[className];
    const rawCandidates = override ?? mapping.defaultSlots;
    const eligible = rawCandidates.filter((slotId) => classSlotIds.has(slotId));

    if (eligible.length === 0) return { kind: "incompatible" };
    if (eligible.length === 1) return { kind: "resolved", slotId: eligible[0] };
    return { kind: "ambiguous", candidates: eligible };
  }

  return { kind: "incompatible" };
}

// ─── Unique short-circuit (D16) ────────────────────────────────────────────

/**
 * Attempts to find a UniqueEntry matching the extracted item's name.
 * Returns the matched entry or null.
 */
function findUniqueEntry(name: string): UniqueEntry | null {
  const normalizedName = normalizeLabel(name);
  if (!normalizedName) return null;

  // Try exact normalized id match first (catalog ids use underscores, not spaces)
  const byId = uniques.find(
    (u) => normalizeLabel(u.id.replace(/_/g, " ")) === normalizedName
  );
  if (byId) return byId;

  // Try normalized label match
  const byLabel = uniques.find((u) => normalizeLabel(u.label) === normalizedName);
  if (byLabel) return byLabel;

  // Fuzzy label match with high threshold
  const scored = uniques
    .map((u) => ({ entry: u, score: jaroWinkler(normalizedName, normalizeLabel(u.label)) }))
    .filter((s) => s.score >= NEAR_PERFECT_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 ? scored[0].entry : null;
}

/**
 * Resolves an extracted aspect using a UniqueEntry's intrinsicAspects (D16).
 * If the unique has an intrinsicAspect with an aspectId → resolved.
 * If it has a label but no aspectId → no-match (caller falls through to normal resolver).
 * Returns null when the unique has no intrinsicAspects.
 */
function resolveAspectFromUnique(
  unique: UniqueEntry,
  extracted: LlmExtractedAspect | undefined
): AspectMatchResult | undefined {
  if (!unique.intrinsicAspects || unique.intrinsicAspects.length === 0) {
    return undefined;
  }

  const ia = unique.intrinsicAspects[0];
  const rolledValue = extracted?.rolledValue ?? (ia.valueRange[0] + ia.valueRange[1]) / 2;

  if (ia.aspectId) {
    return {
      kind: "resolved",
      aspectId: ia.aspectId,
      rolledValue,
    };
  }

  // No catalog aspect id — surface as out-of-range with label for display
  return {
    kind: "uncertain",
    label: extracted?.label ?? ia.label,
    rolledValue,
    reason: "no-match",
  };
}

// ─── Full item resolver ────────────────────────────────────────────────────

/**
 * Resolves an LlmExtractedItem into a ResolvedItem.
 *
 * When rarity is "unique" or "mythic" and the item name matches a UniqueEntry,
 * resolveUnique() fires first to short-circuit slot and aspect resolution (D16).
 *
 * When the slot is ambiguous, uses the first candidate for affix/aspect scoping.
 */
export function resolveItem(extracted: LlmExtractedItem, className: string): ResolvedItem {
  const rarity = extracted.rarity?.toLowerCase() ?? "";

  // ── Unique short-circuit (D16) ─────────────────────────────────────────
  if ((rarity === "unique" || rarity === "mythic") && extracted.name) {
    const uniqueEntry = findUniqueEntry(extracted.name);
    if (uniqueEntry) {
      const slotResult: SlotMatchResult = { kind: "resolved", slotId: uniqueEntry.slot };
      const scopeSlotId = uniqueEntry.slot;

      const resolveAffixList = (list: LlmExtractedAffix[]) =>
        list.map((a) => resolveAffix(a, scopeSlotId, className));

      const aspect =
        resolveAspectFromUnique(uniqueEntry, extracted.aspect) ??
        (extracted.aspect
          ? resolveAspect(extracted.aspect, scopeSlotId, className)
          : undefined);

      return {
        name: extracted.name,
        rarity: extracted.rarity,
        itemPower: extracted.itemPower,
        isAncestral: extracted.isAncestral ?? false,
        implicits: resolveAffixList(extracted.implicits ?? []),
        explicits: resolveAffixList(extracted.explicits ?? []),
        tempered: resolveAffixList(extracted.tempered ?? []),
        aspect,
        slotResult,
      };
    }
  }

  // ── Normal resolution ──────────────────────────────────────────────────
  const slotResult = resolveSlot(extracted.itemType, className);

  const scopeSlotId =
    slotResult.kind === "resolved"
      ? slotResult.slotId
      : slotResult.kind === "ambiguous"
        ? slotResult.candidates[0]
        : "helm";

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
