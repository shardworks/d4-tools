"use client";

import { affixes as affixCatalog } from "@/lib/catalog";
import type { Item, AffixInstance } from "@/lib/schema";
import type { ResolvedItem, AffixMatchResult } from "@/lib/triage/types";
import type { SlotEntry } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

// ─── Delta computation ─────────────────────────────────────────────────────

type AffixDelta =
  | { kind: "improved"; affixId: string; parsedValue: number; equippedValue?: number }
  | { kind: "worsened"; affixId: string; parsedValue?: number; equippedValue: number }
  | { kind: "unchanged"; affixId: string; value: number };

/**
 * Compare two affix lists and produce per-affix deltas.
 * Per D18: improved (parsed > equipped or new), worsened (parsed < equipped or lost), unchanged.
 */
function computeAffixDeltas(
  parsedAffixes: AffixMatchResult[],
  equippedAffixes: AffixInstance[]
): AffixDelta[] {
  const deltas: AffixDelta[] = [];

  const equippedMap = new Map<string, number>();
  for (const a of equippedAffixes) {
    equippedMap.set(a.affixId, a.rolledValue);
  }

  const parsedIds = new Set<string>();

  // Check parsed affixes against equipped
  for (const parsed of parsedAffixes) {
    if (parsed.kind !== "resolved") continue; // skip uncertain
    parsedIds.add(parsed.affixId);

    const equippedValue = equippedMap.get(parsed.affixId);
    if (equippedValue === undefined) {
      // New affix on parsed — improved
      deltas.push({ kind: "improved", affixId: parsed.affixId, parsedValue: parsed.rolledValue });
    } else if (parsed.rolledValue > equippedValue) {
      deltas.push({ kind: "improved", affixId: parsed.affixId, parsedValue: parsed.rolledValue, equippedValue });
    } else if (parsed.rolledValue < equippedValue) {
      deltas.push({ kind: "worsened", affixId: parsed.affixId, parsedValue: parsed.rolledValue, equippedValue });
    } else {
      deltas.push({ kind: "unchanged", affixId: parsed.affixId, value: parsed.rolledValue });
    }
  }

  // Affixes on equipped but NOT on parsed — worsened (lost)
  for (const [affixId, equippedValue] of equippedMap.entries()) {
    if (!parsedIds.has(affixId)) {
      deltas.push({ kind: "worsened", affixId, equippedValue });
    }
  }

  return deltas;
}

// ─── Aggregate counts ─────────────────────────────────────────────────────

interface AggregateCountsProps {
  improved: number;
  worsened: number;
  unchanged: number;
}

function AggregateCounts({ improved, worsened, unchanged }: AggregateCountsProps) {
  return (
    <div className="flex gap-3 text-xs font-medium">
      {improved > 0 && (
        <span className="text-green-400 flex items-center gap-1">
          <ArrowUp size={12} />
          {improved} improved
        </span>
      )}
      {worsened > 0 && (
        <span className="text-red-400 flex items-center gap-1">
          <ArrowDown size={12} />
          {worsened} worsened
        </span>
      )}
      {unchanged > 0 && (
        <span className="text-stone-500 flex items-center gap-1">
          <Minus size={12} />
          {unchanged} unchanged
        </span>
      )}
      {improved === 0 && worsened === 0 && unchanged === 0 && (
        <span className="text-stone-600">No affixes to compare</span>
      )}
    </div>
  );
}

// ─── Delta row ────────────────────────────────────────────────────────────

function DeltaRow({ delta }: { delta: AffixDelta }) {
  const entry = affixCatalog.find((a) => a.id === delta.affixId);
  const label = entry?.label ?? delta.affixId;
  const isPercent = entry?.isPercent ?? false;
  const fmt = (v: number | undefined) =>
    v !== undefined ? `${v}${isPercent ? "%" : ""}` : "—";

  if (delta.kind === "improved") {
    return (
      <div className="flex items-baseline gap-2 text-xs py-[2px]">
        <ArrowUp size={11} className="text-green-400 shrink-0" />
        <span className="text-stone-300 flex-1">{label}</span>
        <span className="text-stone-500 tabular-nums">{fmt(delta.equippedValue)}</span>
        <span className="text-stone-600">→</span>
        <span className="text-green-300 font-mono tabular-nums">{fmt(delta.parsedValue)}</span>
      </div>
    );
  }

  if (delta.kind === "worsened") {
    return (
      <div className="flex items-baseline gap-2 text-xs py-[2px]">
        <ArrowDown size={11} className="text-red-400 shrink-0" />
        <span className="text-stone-300 flex-1">{label}</span>
        <span className="text-stone-500 tabular-nums">{fmt(delta.equippedValue)}</span>
        <span className="text-stone-600">→</span>
        <span className="text-red-300 font-mono tabular-nums">{fmt(delta.parsedValue)}</span>
      </div>
    );
  }

  // unchanged
  return (
    <div className="flex items-baseline gap-2 text-xs py-[2px]">
      <Minus size={11} className="text-stone-600 shrink-0" />
      <span className="text-stone-500 flex-1">{label}</span>
      <span className="text-stone-600 font-mono tabular-nums">{fmt(delta.value)}</span>
    </div>
  );
}

// ─── ComparisonPanel ──────────────────────────────────────────────────────

interface ComparisonPanelProps {
  /** The parsed item (from LLM + resolver) */
  parsed: ResolvedItem;
  /** The item currently equipped in this slot, if any */
  equipped: Item | undefined;
  /** The slot entry for labeling */
  slot: SlotEntry;
}

/**
 * Side-by-side affix comparison for a parsed item vs the currently-equipped item.
 * Shows aggregate counters (improved/worsened/unchanged) at the top (D18).
 * Named ComparisonPanel (not RawDeltaPanel) so the future scoring-engine commission
 * can replace the inner math without renaming (see scoring-engine.md §6).
 */
export function ComparisonPanel({ parsed, equipped, slot }: ComparisonPanelProps) {
  const parsedAllAffixes = [...parsed.implicits, ...parsed.explicits, ...parsed.tempered];
  const equippedAllAffixes = equipped
    ? [...(equipped.implicits ?? []), ...(equipped.explicits ?? []), ...(equipped.tempered ?? [])]
    : [];

  const deltas = computeAffixDeltas(parsedAllAffixes, equippedAllAffixes);
  const improved = deltas.filter((d) => d.kind === "improved").length;
  const worsened = deltas.filter((d) => d.kind === "worsened").length;
  const unchanged = deltas.filter((d) => d.kind === "unchanged").length;

  return (
    <div className="flex flex-col gap-3">
      {/* Slot header */}
      <div className="text-[11px] text-stone-500 uppercase tracking-wider">
        vs. equipped {slot.label}
      </div>

      {/* Aggregate counts */}
      <AggregateCounts improved={improved} worsened={worsened} unchanged={unchanged} />

      {/* Equipped item info (or empty slot) */}
      <div
        className={cn(
          "text-xs rounded px-2 py-1",
          equipped ? "text-stone-400 bg-surface-2" : "text-stone-600 bg-surface-2 italic"
        )}
      >
        {equipped
          ? `Currently equipped: ${equipped.name || slot.label}${equipped.itemPower !== undefined ? ` (${equipped.itemPower} IP)` : ""}`
          : "No item equipped in this slot — all affixes count as improved"}
      </div>

      {/* Per-affix delta rows */}
      {deltas.length > 0 && (
        <div className="flex flex-col">
          {deltas.map((delta, i) => (
            <DeltaRow key={i} delta={delta} />
          ))}
        </div>
      )}
    </div>
  );
}
