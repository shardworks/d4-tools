"use client";

import { affixes as affixCatalog, aspects as aspectCatalog, slots } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { Sparkles, AlertTriangle } from "lucide-react";
import type { AffixMatchResult, AspectMatchResult, ResolvedItem } from "@/lib/triage/types";
import { UncertainAffixRow, UncertainAspectRow } from "./UncertainMatchPicker";

const rarityColor: Record<string, string> = {
  common: "var(--rarity-common)",
  magic: "var(--rarity-magic)",
  rare: "var(--rarity-rare)",
  legendary: "var(--rarity-legendary)",
  unique: "var(--rarity-unique)",
  mythic: "var(--rarity-mythic)",
};

function hexToRgba(cssVar: string, opacity: number): string {
  return `color-mix(in srgb, ${cssVar} ${Math.round(opacity * 100)}%, transparent)`;
}

function AffixResultRow({ result }: { result: AffixMatchResult }) {
  if (result.kind === "resolved") {
    const entry = affixCatalog.find((a) => a.id === result.affixId);
    const label = entry?.label ?? result.affixId;
    const max = entry?.valueRange[1];
    const isGreater = max !== undefined && result.rolledValue >= max;

    return (
      <div className="flex gap-[6px] items-baseline text-xs">
        <span
          className={cn(
            "font-mono tabular-nums shrink-0",
            isGreater ? "text-rarity-mythic" : "text-stone-100"
          )}
        >
          {result.rolledValue}
          {entry?.isPercent ? "%" : ""}
          {isGreater && <Sparkles size={11} className="inline ml-0.5 text-rarity-mythic" />}
        </span>
        <span className="text-stone-400">{label}</span>
      </div>
    );
  }

  // Uncertain — show yellow indicator
  return (
    <div className="flex gap-[6px] items-baseline text-xs text-amber-400">
      <AlertTriangle size={11} className="shrink-0 mt-0.5" />
      <span className="font-mono tabular-nums shrink-0">{result.rolledValue}</span>
      <span className="italic">{result.label} (uncertain)</span>
    </div>
  );
}

export interface ResolvedItemOverrides {
  implicits: Record<number, { affixId: string; rolledValue: number }>;
  explicits: Record<number, { affixId: string; rolledValue: number }>;
  tempered: Record<number, { affixId: string; rolledValue: number }>;
  aspect?: { aspectId: string; rolledValue: number };
  slotId?: string;
}

interface ParsedItemCardProps {
  resolvedItem: ResolvedItem;
  slotId: string;
  charClass: string;
  overrides: ResolvedItemOverrides;
  onAffixOverride: (
    kind: "implicits" | "explicits" | "tempered",
    index: number,
    affixId: string,
    rolledValue: number
  ) => void;
  onAspectOverride: (aspectId: string, rolledValue: number) => void;
}

/**
 * Renders a resolved triage item with uncertain-match inline pickers (D25).
 * Mirrors ItemCard's layout; add uncertainty affordances on top.
 */
export function ParsedItemCard({
  resolvedItem,
  slotId,
  charClass,
  overrides,
  onAffixOverride,
  onAspectOverride,
}: ParsedItemCardProps) {
  const rarity = resolvedItem.rarity.toLowerCase();
  const color = rarityColor[rarity] ?? "var(--rarity-common)";
  const borderColor = hexToRgba(color, 0.3);

  // Build the effective aspect result (override if user picked one)
  const effectiveAspect: AspectMatchResult | undefined =
    overrides.aspect && resolvedItem.aspect
      ? { kind: "resolved", ...overrides.aspect }
      : resolvedItem.aspect;

  const aspectEntry = effectiveAspect?.kind === "resolved"
    ? aspectCatalog.find((a) => a.id === effectiveAspect.aspectId)
    : undefined;

  const slotEntry = slots.find((s) => s.id === slotId);
  const slotLabel = slotEntry?.label ?? slotId;

  // Helper to get effective affix result (override takes precedence)
  function getEffectiveAffix(
    kind: "implicits" | "explicits" | "tempered",
    index: number,
    base: AffixMatchResult
  ): AffixMatchResult {
    const override = overrides[kind][index];
    if (override) {
      return { kind: "resolved", affixId: override.affixId, rolledValue: override.rolledValue };
    }
    return base;
  }

  const allAffixGroups: Array<{
    kind: "implicits" | "explicits" | "tempered";
    results: AffixMatchResult[];
  }> = [
    { kind: "implicits", results: resolvedItem.implicits },
    { kind: "explicits", results: resolvedItem.explicits },
    { kind: "tempered", results: resolvedItem.tempered },
  ];

  return (
    <div
      className={cn(
        "rounded bg-surface-2 flex flex-col p-[var(--item-card-padding)] gap-[var(--item-card-row-gap)]",
        resolvedItem.isAncestral && "ancestral"
      )}
      style={{ border: `1px solid ${borderColor}` }}
    >
      {/* Item name */}
      <div className="font-bold text-[13px] leading-[1.2]" style={{ color }}>
        {resolvedItem.name || slotLabel}
        {resolvedItem.isAncestral && (
          <span className="ml-[6px] text-[10px] text-rarity-unique font-normal">Ancestral</span>
        )}
      </div>

      {/* Slot + power */}
      <div className="flex gap-[6px] text-stone-500 text-[11px]">
        <span>{slotLabel}</span>
        {resolvedItem.itemPower !== undefined && (
          <>
            <span>·</span>
            <span className="tabular-nums">{resolvedItem.itemPower} Item Power</span>
          </>
        )}
      </div>

      {/* Aspect */}
      {effectiveAspect?.kind === "resolved" && aspectEntry && (
        <div className="text-rarity-legendary text-[11px] italic">{aspectEntry.label}</div>
      )}
      {effectiveAspect?.kind === "uncertain" && (
        <UncertainAspectRow
          result={effectiveAspect}
          slotId={slotId}
          className={charClass}
          rolledValue={effectiveAspect.rolledValue}
          onResolve={onAspectOverride}
        />
      )}

      {/* Affixes */}
      {allAffixGroups.map(({ kind, results }) =>
        results.length > 0 ? (
          <div key={kind} className="flex flex-col gap-[3px]">
            {results.map((baseResult, i) => {
              const effective = getEffectiveAffix(kind, i, baseResult);
              if (baseResult.kind === "uncertain" && effective.kind === "uncertain") {
                return (
                  <UncertainAffixRow
                    key={i}
                    result={effective}
                    index={i}
                    slotId={slotId}
                    className={charClass}
                    onResolve={(idx, affixId, rolledValue) =>
                      onAffixOverride(kind, idx, affixId, rolledValue)
                    }
                  />
                );
              }
              return <AffixResultRow key={i} result={effective} />;
            })}
          </div>
        ) : null
      )}
    </div>
  );
}
