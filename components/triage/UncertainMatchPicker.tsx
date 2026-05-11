"use client";

import { AffixCombobox } from "@/components/d4/AffixCombobox";
import { AspectCombobox } from "@/components/d4/AspectCombobox";
import { affixes as affixCatalog, aspects as aspectCatalog, getAffixValueRangeAtItemPower } from "@/lib/catalog";
import type { AffixMatchResult, AspectMatchResult } from "@/lib/triage/types";
import type { AffixPosition } from "@/lib/triage/resolve";
import { CheckCircle, HelpCircle } from "lucide-react";

// ─── Affix uncertainty picker ─────────────────────────────────────────────

interface UncertainAffixRowProps {
  result: AffixMatchResult;
  index: number;
  slotId: string;
  className: string;
  /**
   * Position of the affix row being overridden — passed through to AffixCombobox
   * so operators cannot route an implicit affix into an explicit slot or vice versa (v18 D4).
   * Defaults to `"explicit"` when omitted (safe fallback for callers not yet position-aware).
   */
  position?: AffixPosition;
  onResolve: (index: number, affixId: string, rolledValue: number) => void;
}

/**
 * Renders an inline picker for an uncertain affix match.
 *
 * Reason phrasings (v17 D7):
 *  - "out-of-range"    : warns about value; falls back to full combobox
 *  - "no-match"        : no match found; opens full combobox
 *  - "ambiguous"       : multiple candidates (D5); shows constrained candidate buttons
 *  - "value-mismatch"  : auto-corrected unit; shows accept/reject confirmation (D4)
 */
export function UncertainAffixRow({
  result,
  index,
  slotId,
  className,
  position = "explicit",
  onResolve,
}: UncertainAffixRowProps) {
  if (result.kind === "resolved") return null;

  const { reason } = result;

  // ── value-mismatch: auto-correct confirmation (D4) ─────────────────────
  if (reason === "value-mismatch") {
    const affixEntry = affixCatalog.find((a) => a.id === result.affixId);
    const label = affixEntry?.label ?? result.affixId;
    return (
      <div className="flex flex-col gap-1 p-2 bg-amber-950/30 border border-amber-800/40 rounded">
        <div className="text-[11px] text-amber-400 font-medium">
          Value looks like a unit mismatch — auto-corrected
        </div>
        <div className="text-xs text-stone-400 mb-1">
          Parsed: &ldquo;{result.label}&rdquo; = {result.rolledValue} →{" "}
          <span className="text-stone-200 font-mono">{result.unitCorrected}</span>
          {affixEntry?.isPercent ? "%" : ""}
        </div>
        <div className="text-xs text-stone-500 mb-1">Affix: {label}</div>
        <div className="flex gap-2">
          <button
            type="button"
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-900/40 text-green-300 border border-green-800/50 hover:bg-green-900/60 transition-colors"
            onClick={() => onResolve(index, result.affixId, result.unitCorrected)}
          >
            <CheckCircle size={11} />
            Accept {result.unitCorrected}{affixEntry?.isPercent ? "%" : ""}
          </button>
          <AffixCombobox
            slotId={slotId}
            className={className}
            value={result.affixId}
            position={position}
            onSelect={(affixId) => onResolve(index, affixId, result.rolledValue)}
            placeholder="Override…"
          />
        </div>
      </div>
    );
  }

  // ── ambiguous: constrained candidate list (D5) ─────────────────────────
  if (reason === "ambiguous") {
    const candidateEntries = result.candidates
      .map((id) => affixCatalog.find((a) => a.id === id))
      .filter((e): e is NonNullable<typeof e> => e !== undefined);

    return (
      <div className="flex flex-col gap-1 p-2 bg-amber-950/30 border border-amber-800/40 rounded">
        <div className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
          <HelpCircle size={11} />
          Multiple matches — select the correct affix
        </div>
        <div className="text-xs text-stone-400 mb-1">
          Parsed: &ldquo;{result.label}&rdquo; = {result.rolledValue}
        </div>
        <div className="flex flex-col gap-1">
          {candidateEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="text-left text-xs px-2 py-1 rounded bg-stone-800/60 text-stone-200 border border-stone-700/50 hover:bg-stone-700/60 transition-colors"
              onClick={() => onResolve(index, entry.id, result.rolledValue)}
            >
              <span className="font-medium">{entry.label}</span>
              {(() => {
                const { min, max } = getAffixValueRangeAtItemPower(entry);
                return (
                  <span className="ml-2 text-stone-500 font-mono text-[10px]">
                    {min}–{max}
                    {entry.isPercent ? "%" : ""}
                  </span>
                );
              })()}
            </button>
          ))}
          <div className="text-[10px] text-stone-500 mt-0.5">
            Not listed?{" "}
            <span className="underline cursor-pointer">
              <AffixCombobox
                slotId={slotId}
                className={className}
                value={undefined}
                position={position}
                onSelect={(affixId) => onResolve(index, affixId, result.rolledValue)}
                placeholder="Browse all…"
              />
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── out-of-range / no-match: full combobox ─────────────────────────────
  const hint =
    reason === "out-of-range"
      ? "Out-of-range value — please confirm affix"
      : "Unresolved affix — please select from catalog";

  const preselectedId =
    result.kind === "uncertain" && "affixId" in result ? result.affixId : undefined;

  return (
    <div className="flex flex-col gap-1 p-2 bg-amber-950/30 border border-amber-800/40 rounded">
      <div className="text-[11px] text-amber-400 font-medium">{hint}</div>
      <div className="text-xs text-stone-400 mb-1">
        Parsed: &ldquo;{result.label}&rdquo; = {result.rolledValue}
      </div>
      <AffixCombobox
        slotId={slotId}
        className={className}
        value={preselectedId}
        position={position}
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
 *
 * Reason phrasings (v17 D7):
 *  - "out-of-range"   : warns about value; full combobox
 *  - "no-match"       : no match; full combobox
 *  - "ambiguous"      : multiple candidates; constrained list (D5)
 *  - "value-mismatch" : auto-corrected unit; accept/reject confirmation (D4)
 */
export function UncertainAspectRow({
  result,
  slotId,
  className,
  rolledValue,
  onResolve,
}: UncertainAspectRowProps) {
  if (result.kind === "resolved") return null;

  const { reason } = result;

  // ── value-mismatch ─────────────────────────────────────────────────────
  if (reason === "value-mismatch") {
    const aspectEntry = aspectCatalog.find((a) => a.id === result.aspectId);
    const label = aspectEntry?.label ?? result.aspectId;
    return (
      <div className="flex flex-col gap-1 p-2 bg-amber-950/30 border border-amber-800/40 rounded">
        <div className="text-[11px] text-amber-400 font-medium">
          Aspect value looks like a unit mismatch — auto-corrected
        </div>
        <div className="text-xs text-stone-400 mb-1">
          Parsed: &ldquo;{result.label}&rdquo; = {rolledValue} →{" "}
          <span className="text-stone-200 font-mono">{result.unitCorrected}</span>
          {aspectEntry?.isPercent ? "%" : ""}
        </div>
        <div className="text-xs text-stone-500 mb-1">Aspect: {label}</div>
        <div className="flex gap-2">
          <button
            type="button"
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-900/40 text-green-300 border border-green-800/50 hover:bg-green-900/60 transition-colors"
            onClick={() => onResolve(result.aspectId, result.unitCorrected)}
          >
            <CheckCircle size={11} />
            Accept {result.unitCorrected}{aspectEntry?.isPercent ? "%" : ""}
          </button>
          <AspectCombobox
            slotId={slotId}
            className={className}
            value={result.aspectId}
            onSelect={(aspectId) => onResolve(aspectId, rolledValue)}
            placeholder="Override…"
          />
        </div>
      </div>
    );
  }

  // ── ambiguous ──────────────────────────────────────────────────────────
  if (reason === "ambiguous") {
    const candidateEntries = result.candidates
      .map((id) => aspectCatalog.find((a) => a.id === id))
      .filter((e): e is NonNullable<typeof e> => e !== undefined);

    return (
      <div className="flex flex-col gap-1 p-2 bg-amber-950/30 border border-amber-800/40 rounded">
        <div className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
          <HelpCircle size={11} />
          Multiple aspect matches — select the correct one
        </div>
        <div className="text-xs text-stone-400 mb-1">
          Parsed: &ldquo;{result.label}&rdquo; = {rolledValue}
        </div>
        <div className="flex flex-col gap-1">
          {candidateEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="text-left text-xs px-2 py-1 rounded bg-stone-800/60 text-stone-200 border border-stone-700/50 hover:bg-stone-700/60 transition-colors"
              onClick={() => onResolve(entry.id, rolledValue)}
            >
              <span className="font-medium">{entry.label}</span>
              <span className="ml-2 text-stone-500 font-mono text-[10px]">
                {entry.valueRange[0]}–{entry.valueRange[1]}
                {entry.isPercent ? "%" : ""}
              </span>
            </button>
          ))}
          <AspectCombobox
            slotId={slotId}
            className={className}
            value={undefined}
            onSelect={(aspectId) => onResolve(aspectId, rolledValue)}
            placeholder="Browse all…"
          />
        </div>
      </div>
    );
  }

  // ── out-of-range / no-match ────────────────────────────────────────────
  const hint =
    reason === "out-of-range"
      ? "Out-of-range aspect value — please confirm"
      : "Unresolved aspect — please select from catalog";

  const preselectedId =
    result.kind === "uncertain" && "aspectId" in result ? result.aspectId : undefined;

  return (
    <div className="flex flex-col gap-1 p-2 bg-amber-950/30 border border-amber-800/40 rounded">
      <div className="text-[11px] text-amber-400 font-medium">{hint}</div>
      <div className="text-xs text-stone-400 mb-1">
        Parsed: &ldquo;{result.label}&rdquo; = {rolledValue}
      </div>
      <AspectCombobox
        slotId={slotId}
        className={className}
        value={preselectedId}
        onSelect={(aspectId) => onResolve(aspectId, rolledValue)}
        placeholder="Select aspect…"
      />
    </div>
  );
}
