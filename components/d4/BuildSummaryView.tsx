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
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "1200px" }}>
      {/* Build header */}
      <div>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--stone-100)",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {character.name}
        </h1>
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            marginTop: "6px",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: "14px",
              color: "var(--accent)",
              fontWeight: 600,
            }}
          >
            {build.name}
          </span>
          <span style={{ color: "var(--stone-600)" }}>·</span>
          <span style={{ fontSize: "13px", color: "var(--stone-400)" }}>
            {character.class}
          </span>
          <span style={{ color: "var(--stone-600)" }}>·</span>
          <span style={{ fontSize: "13px", color: "var(--stone-400)" }}>
            Level {character.level}
          </span>
          <span style={{ color: "var(--stone-600)" }}>·</span>
          <span style={{ fontSize: "13px", color: "var(--stone-400)" }}>
            Paragon {character.paragonAllocation.paragonLevel}
          </span>
          <span style={{ color: "var(--stone-600)" }}>·</span>
          <span
            style={{
              fontSize: "12px",
              color: "var(--stone-600)",
              fontStyle: "italic",
            }}
          >
            Power score: —
          </span>
        </div>
      </div>

      {/* Main content: gear grid + stat block side by side */}
      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <GearSlotGrid
            items={character.equippedItems}
            characterClass={character.class}
            editable={editable}
            onItemSave={onItemSave}
            onItemRemove={onItemRemove}
          />
        </div>
        <div style={{ width: "260px", flexShrink: 0 }}>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--stone-500)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "8px",
            }}
          >
            Character Stats
          </div>
          <StatBlock stats={placeholderStats} />
        </div>
      </div>
    </div>
  );
}
