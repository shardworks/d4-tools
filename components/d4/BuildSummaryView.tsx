import { GearSlotGrid } from "./GearSlotGrid";
import { StatBlock } from "./StatBlock";

type Affix = {
  label: string;
  value: string;
};

type Item = {
  id: string;
  slot: string;
  name: string;
  rarity: "common" | "magic" | "rare" | "legendary" | "unique" | "mythic";
  itemPower?: number;
  affixes: Affix[];
  aspectName?: string;
  isAncestral?: boolean;
};

type Character = {
  name: string;
  class: string;
  level: number;
  paragon: number;
  buildName: string;
  items: Item[];
  stats: Array<{ label: string; value: string }>;
};

type BuildSummaryViewProps = {
  character: Character;
};

export function BuildSummaryView({ character }: BuildSummaryViewProps) {
  // Convert items array to a Record keyed by slot id
  const itemsBySlot: Record<string, Item> = {};
  for (const item of character.items) {
    itemsBySlot[item.slot] = item;
  }

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
            {character.buildName}
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
            Paragon {character.paragon}
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
          <GearSlotGrid items={itemsBySlot} />
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
          <StatBlock stats={character.stats} />
        </div>
      </div>
    </div>
  );
}
