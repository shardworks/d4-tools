"use client";

import type { Character, Build, Item } from "@/lib/schema";
import { GearSlotGrid } from "./GearSlotGrid";
import { StatBlock } from "./StatBlock";

interface BuildSummaryViewProps {
  character: Character;
  build: Build;
  /** When true, gear slots are clickable and open the slot editor */
  editable?: boolean;
  /** Called after a slot item is saved (parent persists the change) */
  onItemSave?: (slotId: string, item: Item) => Promise<void>;
  /** Called after a slot item is removed */
  onItemRemove?: (slotId: string) => Promise<void>;
}

export function BuildSummaryView({
  character,
  build,
  editable = false,
  onItemSave,
  onItemRemove,
}: BuildSummaryViewProps) {
  // Placeholder stats — scoring engine will populate these in a future commission
  const placeholderStats: Array<{ label: string; value: string }> = [
    { label: "Level", value: String(character.level) },
    { label: "Paragon", value: String(character.paragonAllocation.paragonLevel) },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-[1200px]">
      {/* Build header */}
      <div>
        <h1 className="text-[22px] font-bold text-stone-100 m-0 leading-[1.2]">
          {character.name}
        </h1>
        <div className="flex gap-3 items-center mt-[6px] flex-wrap">
          <span className="text-base font-semibold text-accent">
            {build.name}
          </span>
          <span className="text-stone-600">·</span>
          <span className="text-sm text-stone-400">{character.class}</span>
          <span className="text-stone-600">·</span>
          <span className="text-sm text-stone-400">Level {character.level}</span>
          <span className="text-stone-600">·</span>
          <span className="text-sm text-stone-400">
            Paragon {character.paragonAllocation.paragonLevel}
          </span>
          <span className="text-stone-600">·</span>
          <span className="text-xs text-stone-600 italic">Power score: —</span>
        </div>
      </div>

      {/* Main content: gear grid + stat block side by side */}
      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
          <GearSlotGrid
            items={character.equippedItems}
            characterClass={character.class}
            editable={editable}
            onItemSave={onItemSave}
            onItemRemove={onItemRemove}
          />
        </div>
        <div className="w-[260px] shrink-0">
          <div className="mini-label tracking-[0.08em] mb-2">
            Character Stats
          </div>
          <StatBlock stats={placeholderStats} />
        </div>
      </div>
    </div>
  );
}
