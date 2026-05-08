"use client";

import { AffixCombobox } from "@/components/d4/AffixCombobox";
import { AspectCombobox } from "@/components/d4/AspectCombobox";
import type { AffixMatchResult, AspectMatchResult } from "@/lib/triage/types";

// ─── Affix uncertainty picker ─────────────────────────────────────────────

interface UncertainAffixRowProps {
  result: AffixMatchResult;
  index: number;
  slotId: string;
  className: string;
  onResolve: (index: number, affixId: string, rolledValue: number) => void;
}

/**
 * Renders an inline picker for an uncertain affix match.
 * Re-uses AffixCombobox filtered to the item's slot + class.
 */
export function UncertainAffixRow({
  result,
  index,
  slotId,
  className,
  onResolve,
}: UncertainAffixRowProps) {
  if (result.kind === "resolved") return null;

  return (
    <div className="flex flex-col gap-1 p-2 bg-amber-950/30 border border-amber-800/40 rounded">
      <div className="text-[11px] text-amber-400 font-medium">
        {result.reason === "out-of-range"
          ? "Out-of-range value — please confirm affix"
          : "Unresolved affix — please select from catalog"}
      </div>
      <div className="text-xs text-stone-400 mb-1">
        Parsed: &ldquo;{result.label}&rdquo; = {result.rolledValue}
      </div>
      <AffixCombobox
        slotId={slotId}
        className={className}
        value={result.kind === "uncertain" ? result.affixId : undefined}
        onSelect={(affixId) => onResolve(index, affixId, result.rolledValue)}
        placeholder="Select affix…"
      />
    </div>
  );
}

// ─── Aspect uncertainty picker ────────────────────────────────────────────

interface UncertainAspectRowProps {
  result: AspectMatchResult;
  slotId: string;
  className: string;
  rolledValue: number;
  onResolve: (aspectId: string, rolledValue: number) => void;
}

/**
 * Renders an inline picker for an uncertain aspect match.
 * Re-uses AspectCombobox filtered to the item's slot + class.
 */
export function UncertainAspectRow({
  result,
  slotId,
  className,
  rolledValue,
  onResolve,
}: UncertainAspectRowProps) {
  if (result.kind === "resolved") return null;

  return (
    <div className="flex flex-col gap-1 p-2 bg-amber-950/30 border border-amber-800/40 rounded">
      <div className="text-[11px] text-amber-400 font-medium">
        {result.reason === "out-of-range"
          ? "Out-of-range aspect value — please confirm"
          : "Unresolved aspect — please select from catalog"}
      </div>
      <div className="text-xs text-stone-400 mb-1">
        Parsed: &ldquo;{result.label}&rdquo; = {rolledValue}
      </div>
      <AspectCombobox
        slotId={slotId}
        className={className}
        value={result.kind === "uncertain" ? result.aspectId : undefined}
        onSelect={(aspectId) => onResolve(aspectId, rolledValue)}
        placeholder="Select aspect…"
      />
    </div>
  );
}
