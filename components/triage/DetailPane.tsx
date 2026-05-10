"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ImageOff, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Character, Build, Item } from "@/lib/schema";
import type { DamageConfig } from "@/lib/damage";
import { ItemSchema } from "@/lib/schema";
import type { CacheEntry, ResolvedItem, AffixMatchResult, AspectMatchResult } from "@/lib/triage/types";
import type { ResolvedItemOverrides } from "./ParsedItemCard";
import { ParsedItemCard } from "./ParsedItemCard";
import { ComparisonPanel } from "./ComparisonPanel";
import { DpsDeltaSection } from "./DpsDeltaSection";
import { SlotPicker } from "./SlotPicker";
import { slots } from "@/lib/catalog";

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true if any affix or aspect is still uncertain (blocks Wear button, D13).
 * "ambiguous" reason is kind="uncertain" — intentionally blocks here per D13.
 * "value-mismatch" reason is also kind="uncertain" — blocks until user confirms.
 */
function hasUncertainMatches(
  item: ResolvedItem,
  overrides: ResolvedItemOverrides
): boolean {
  const groups: Array<{
    kind: "implicits" | "explicits" | "tempered";
    results: AffixMatchResult[];
  }> = [
    { kind: "implicits", results: item.implicits },
    { kind: "explicits", results: item.explicits },
    { kind: "tempered", results: item.tempered },
  ];

  for (const { kind, results } of groups) {
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.kind === "uncertain" && !overrides[kind][i]) return true;
    }
  }

  if (item.aspect?.kind === "uncertain" && !overrides.aspect) return true;

  return false;
}

/** Builds an Item from a ResolvedItem + overrides, or null if not fully resolved. */
function buildItem(
  resolved: ResolvedItem,
  slotId: string,
  overrides: ResolvedItemOverrides
): Item | null {
  function resolveAffixList(
    kind: "implicits" | "explicits" | "tempered",
    results: AffixMatchResult[]
  ) {
    return results.flatMap((r, i): Array<{ affixId: string; rolledValue: number }> => {
      if (r.kind === "resolved") return [{ affixId: r.affixId, rolledValue: r.rolledValue }];
      const override = overrides[kind][i];
      if (override) return [{ affixId: override.affixId, rolledValue: override.rolledValue }];
      return []; // skip unresolved
    });
  }

  let aspectInstance: { aspectId: string; rolledValue: number; source: "legendary" } | undefined;
  if (resolved.aspect) {
    if (resolved.aspect.kind === "resolved") {
      aspectInstance = {
        aspectId: resolved.aspect.aspectId,
        rolledValue: resolved.aspect.rolledValue,
        source: "legendary",
      };
    } else if (overrides.aspect) {
      aspectInstance = {
        aspectId: overrides.aspect.aspectId,
        rolledValue: overrides.aspect.rolledValue,
        source: "legendary",
      };
    }
  }

  const rarity = resolved.rarity as Item["rarity"];
  const validRarities = ["common", "magic", "rare", "legendary", "unique", "mythic"] as const;
  const safeRarity = validRarities.includes(rarity) ? rarity : "legendary";

  const raw = {
    slot: slotId,
    name: resolved.name,
    rarity: safeRarity,
    itemPower: resolved.itemPower,
    isAncestral: resolved.isAncestral,
    implicits: resolveAffixList("implicits", resolved.implicits),
    explicits: resolveAffixList("explicits", resolved.explicits),
    tempered: resolveAffixList("tempered", resolved.tempered),
    aspect: aspectInstance,
    masterworkRank: 0,
    runes: [],
    sockets: [],
  };

  const parsed = ItemSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ─── DetailPane ───────────────────────────────────────────────────────────

interface DetailPaneProps {
  filename: string | null;
  parseResult: { hash: string; entry: CacheEntry } | null;
  resolvedItems: ResolvedItem[] | null;
  character: Character | null;
  activeBuild: Build | null;
  isParsing: boolean;
  parseError: string | null;
  onParse: () => void;
  /** Server-loaded damage config. Passed to DpsDeltaSection for local-override support. */
  damageConfig?: DamageConfig;
}

export function DetailPane({
  filename,
  parseResult,
  resolvedItems,
  character,
  activeBuild,
  isParsing,
  parseError,
  onParse,
  damageConfig,
}: DetailPaneProps) {
  const router = useRouter();

  // Active item selection when screenshot has multiple items
  const [activeItemIndex, setActiveItemIndex] = useState(0);

  // Per-item overrides (uncertain match resolutions + slot picks)
  const [overrides, setOverrides] = useState<ResolvedItemOverrides[]>([]);

  // Wear action state
  const [wearError, setWearError] = useState<string | null>(null);
  const [wearSuccess, setWearSuccess] = useState(false);

  const getOverrides = useCallback(
    (index: number): ResolvedItemOverrides =>
      overrides[index] ?? { implicits: {}, explicits: {}, tempered: {} },
    [overrides]
  );

  const updateOverrides = useCallback((index: number, updated: ResolvedItemOverrides) => {
    setOverrides((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  }, []);

  // Derived values — computed unconditionally so all hooks appear before any early return
  const activeItem = resolvedItems?.[activeItemIndex];
  const itemOverrides = getOverrides(activeItemIndex);

  // Determine the effective slot ID
  const slotResult = activeItem?.slotResult;
  const effectiveSlotId =
    slotResult?.kind === "resolved"
      ? slotResult.slotId
      : slotResult?.kind === "ambiguous"
        ? itemOverrides.slotId
        : undefined;

  const slotEntry = effectiveSlotId ? slots.find((s) => s.id === effectiveSlotId) : undefined;

  // Equipped item for this slot
  const equippedItem =
    character && effectiveSlotId ? character.equippedItems[effectiveSlotId] : undefined;

  // Wear button gating
  const hasUncertain = activeItem ? hasUncertainMatches(activeItem, itemOverrides) : false;
  const isIncompatible = slotResult?.kind === "incompatible";
  const needsSlotPick = slotResult?.kind === "ambiguous" && !itemOverrides.slotId;
  const canWear =
    !hasUncertain && !isIncompatible && !needsSlotPick && !!activeItem && !!effectiveSlotId && !!character;

  // handleWear must be declared before any early return (rules-of-hooks)
  const handleWear = useCallback(async () => {
    if (!canWear || !activeItem || !effectiveSlotId || !character) return;

    const item = buildItem(activeItem, effectiveSlotId, itemOverrides);
    if (!item) {
      setWearError("Could not build item from resolved data");
      return;
    }

    const updated: Character = {
      ...character,
      equippedItems: { ...character.equippedItems, [effectiveSlotId]: item },
      updatedAt: new Date().toISOString(),
    };

    const res = await fetch(`/api/characters/${character.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setWearError(err.error ?? "Failed to save item");
      return;
    }

    setWearError(null);
    setWearSuccess(true);
    router.refresh();
    setTimeout(() => setWearSuccess(false), 2000);
  }, [canWear, activeItem, effectiveSlotId, character, itemOverrides, router]);

  // Empty states — early return is safe here because all hooks are declared above
  if (!filename) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-6">
        <ImageOff size={32} className="text-stone-600" />
        <p className="text-stone-500 text-sm font-medium">No screenshot selected</p>
        <p className="text-stone-600 text-xs text-center">Click a thumbnail to select it.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4">
      {/* Screenshot preview */}
      <div className="rounded overflow-hidden border border-stone-800 bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/triage/screenshots/${encodeURIComponent(filename)}`}
          alt={filename}
          className="w-full object-contain max-h-64"
        />
      </div>

      {/* Parse action */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onParse}
          disabled={isParsing}
          className="gap-2"
        >
          {isParsing && <Loader2 size={14} className="animate-spin" />}
          {isParsing ? "Parsing…" : parseResult ? "Re-parse" : "Parse"}
        </Button>
        {parseResult && !isParsing && (
          <span className="text-[11px] text-stone-500">
            {parseResult.entry.kind === "item"
              ? `${parseResult.entry.items.length} item(s) found`
              : parseResult.entry.kind === "no-item-detected"
                ? "No item detected"
                : "Uncertain extraction"}
          </span>
        )}
      </div>

      {parseError && (
        <div className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">
          {parseError}
        </div>
      )}

      {/* No active build warning */}
      {!activeBuild && (
        <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded px-3 py-2">
          No active build — visit a build to set it as active. Comparison and wear are unavailable.
        </div>
      )}

      {/* Multi-item picker */}
      {resolvedItems && resolvedItems.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs text-stone-500 self-center">Items:</span>
          {resolvedItems.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setActiveItemIndex(i);
                setWearError(null);
                setWearSuccess(false);
              }}
              className={
                i === activeItemIndex
                  ? "px-2 py-0.5 rounded text-xs font-medium bg-accent text-stone-900 border border-accent"
                  : "px-2 py-0.5 rounded text-xs font-medium bg-surface-2 text-stone-400 border border-stone-700 hover:border-stone-500"
              }
            >
              {item.name || `Item ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* No item detected state */}
      {parseResult?.entry.kind === "no-item-detected" && (
        <div className="text-sm text-stone-500 italic">
          No item tooltip was detected in this screenshot.
        </div>
      )}

      {/* Uncertain extraction state */}
      {parseResult?.entry.kind === "uncertain" && (
        <div className="text-sm text-amber-400">
          The LLM could not reliably parse this screenshot. Try a clearer screenshot.
        </div>
      )}

      {/* Parsed item card */}
      {activeItem && effectiveSlotId && (
        <>
          {/* Slot picker for ambiguous slots */}
          {slotResult?.kind === "ambiguous" && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-amber-400">
                Multiple slots available — please select:
              </span>
              <SlotPicker
                candidates={slotResult.candidates}
                value={itemOverrides.slotId}
                onChange={(slotId) =>
                  updateOverrides(activeItemIndex, { ...itemOverrides, slotId })
                }
              />
            </div>
          )}

          {/* Incompatible class */}
          {isIncompatible && (
            <div className="text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded px-3 py-2">
              This item type does not fit any slot for the active character&apos;s class (
              {character?.class ?? "unknown"}).
            </div>
          )}

          <ParsedItemCard
            resolvedItem={activeItem}
            slotId={effectiveSlotId}
            charClass={character?.class ?? "Sorcerer"}
            overrides={itemOverrides}
            onAffixOverride={(kind, index, affixId, rolledValue) =>
              updateOverrides(activeItemIndex, {
                ...itemOverrides,
                [kind]: { ...itemOverrides[kind], [index]: { affixId, rolledValue } },
              })
            }
            onAspectOverride={(aspectId, rolledValue) =>
              updateOverrides(activeItemIndex, {
                ...itemOverrides,
                aspect: { aspectId, rolledValue },
              })
            }
          />

          {/* Comparison panel */}
          {slotEntry && (
            <ComparisonPanel
              parsed={activeItem}
              equipped={equippedItem}
              slot={slotEntry}
            />
          )}

          {/* DPS delta (D37): shown when character, build, and slot are all available */}
          {character && activeBuild && effectiveSlotId && (() => {
            const tentativeItem = buildItem(activeItem, effectiveSlotId, itemOverrides);
            if (!tentativeItem) return null;
            return (
              <DpsDeltaSection
                character={character}
                build={activeBuild}
                newItem={tentativeItem}
                slotId={effectiveSlotId}
                config={damageConfig}
              />
            );
          })()}

          {/* Wear action */}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={handleWear}
              disabled={!canWear || wearSuccess}
              title={
                isIncompatible
                  ? "Incompatible item type for this character class"
                  : needsSlotPick
                    ? "Select a slot first"
                    : hasUncertain
                      ? "Resolve all uncertain matches before wearing"
                      : !activeBuild
                        ? "No active build"
                        : undefined
              }
              className="gap-2"
            >
              {wearSuccess && <CheckCircle size={14} />}
              {wearSuccess ? "Worn!" : "Wear this"}
            </Button>
            {wearError && (
              <span className="text-xs text-destructive">{wearError}</span>
            )}
          </div>
        </>
      )}

      {/* Slot ambiguous + no slot picked */}
      {activeItem && slotResult?.kind === "ambiguous" && !effectiveSlotId && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] text-amber-400">
            Multiple slots available — please select:
          </span>
          <SlotPicker
            candidates={slotResult.candidates}
            value={itemOverrides.slotId}
            onChange={(slotId) =>
              updateOverrides(activeItemIndex, { ...itemOverrides, slotId })
            }
          />
        </div>
      )}
    </div>
  );
}
