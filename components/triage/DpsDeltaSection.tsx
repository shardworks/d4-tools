"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Character, Build, Item } from "@/lib/schema";
import { computeBuildDps } from "@/lib/damage";
import { baseConfig } from "@/lib/damage/client-config";
import { getSkillsForClass, affixes, aspects } from "@/lib/catalog";
import { formatDps } from "@/components/d4/SkillDpsSection";

interface DpsDeltaSectionProps {
  /** Current character state */
  character: Character;
  /** Active build (used for skillRankMap) */
  build: Build;
  /** Fully-resolved item to simulate equipping */
  newItem: Item;
  /** Slot the item would occupy */
  slotId: string;
}

/**
 * Computes and displays the DPS delta from equipping a new item (D37).
 *
 * Shows: "Equipping this item adds X DPS (Y%)" or "Equipping this item reduces DPS by X (Y%)".
 * Null state (D28): "DPS impact unavailable" when either DPS is zero (e.g. no weapon, no skills).
 *
 * Pure computation in useMemo — no I/O.
 */
export function DpsDeltaSection({ character, build, newItem, slotId }: DpsDeltaSectionProps) {
  const delta = useMemo(() => {
    const catalog = {
      skills: getSkillsForClass(character.class),
      affixes,
      aspects,
    };

    try {
      const currentDps = computeBuildDps(build, character, catalog, baseConfig).aggregate;

      // Simulate equipping the new item into the slot
      const updatedCharacter: Character = {
        ...character,
        equippedItems: { ...character.equippedItems, [slotId]: newItem },
      };
      const newDps = computeBuildDps(build, updatedCharacter, catalog, baseConfig).aggregate;

      return { currentDps, newDps, diff: newDps - currentDps };
    } catch {
      return null;
    }
  }, [character, build, newItem, slotId]);

  if (!delta) {
    return (
      <div className="text-xs text-stone-600 italic">DPS impact unavailable</div>
    );
  }

  const { currentDps, newDps, diff } = delta;

  // Null state: neither the current nor the new setup has any damaging output
  if (currentDps === 0 && newDps === 0) {
    return (
      <div className="text-xs text-stone-600 italic">
        DPS impact unavailable — no damaging skills or no weapon equipped
      </div>
    );
  }

  const absDiff = Math.abs(diff);
  const pctDiff =
    currentDps > 0 ? Math.abs(Math.round((diff / currentDps) * 100)) : null;

  const pctLabel = pctDiff !== null ? ` (${pctDiff}%)` : "";

  if (diff > 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-green-400 font-medium">
        <TrendingUp size={13} className="shrink-0" />
        <span>
          Equipping this item adds{" "}
          <span className="tabular-nums font-mono">{formatDps(absDiff)}</span>
          {" "}DPS{pctLabel}
        </span>
      </div>
    );
  }

  if (diff < 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-red-400 font-medium">
        <TrendingDown size={13} className="shrink-0" />
        <span>
          Equipping this item reduces DPS by{" "}
          <span className="tabular-nums font-mono">{formatDps(absDiff)}</span>
          {pctLabel}
        </span>
      </div>
    );
  }

  // No change
  return (
    <div className="flex items-center gap-2 text-xs text-stone-400">
      <Minus size={13} className="shrink-0" />
      <span>No DPS change from equipping this item</span>
    </div>
  );
}
