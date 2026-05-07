import type { Item } from "@/lib/schema";
import { affixes as affixCatalog, aspects as aspectCatalog } from "@/lib/catalog";

type ItemCardProps = {
  item: Item;
};

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

function AffixRow({ affixId, rolledValue }: { affixId: string; rolledValue: number }) {
  const entry = affixCatalog.find((a) => a.id === affixId);
  const label = entry?.label ?? affixId;
  const max = entry?.valueRange[1];
  const isGreater = max !== undefined && rolledValue >= max;

  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        alignItems: "baseline",
        fontSize: "12px",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          color: isGreater ? "var(--rarity-mythic, #d4a017)" : "var(--stone-100)",
          flexShrink: 0,
        }}
      >
        {rolledValue}
        {entry?.isPercent ? "%" : ""}
        {isGreater && " ✦"}
      </span>
      <span style={{ color: "var(--stone-400)" }}>{label}</span>
    </div>
  );
}

export function ItemCard({ item }: ItemCardProps) {
  const color = rarityColor[item.rarity] ?? "var(--rarity-common)";
  const borderColor = hexToRgba(color, 0.3);

  const aspectEntry = item.aspect
    ? aspectCatalog.find((a) => a.id === item.aspect!.aspectId)
    : undefined;

  const allAffixes = [
    ...item.implicits,
    ...item.explicits,
    ...item.tempered,
  ];

  const displayName = item.name || (item.rarity === "unique" ? "Unknown Unique" : item.slot);

  return (
    <div
      className={item.isAncestral ? "ancestral" : undefined}
      style={{
        borderRadius: "var(--radius-card)",
        border: `1px solid ${borderColor}`,
        padding: "var(--item-card-padding)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--item-card-row-gap)",
        backgroundColor: "var(--surface-2)",
      }}
    >
      {/* Item name */}
      <div
        style={{
          color,
          fontWeight: 700,
          fontSize: "13px",
          lineHeight: 1.2,
        }}
      >
        {displayName}
        {item.isAncestral && (
          <span
            style={{
              marginLeft: "6px",
              fontSize: "10px",
              color: "var(--rarity-unique, #8b5e3c)",
              fontWeight: 400,
            }}
          >
            Ancestral
          </span>
        )}
      </div>

      {/* Slot + power */}
      <div
        style={{
          color: "var(--stone-500)",
          fontSize: "11px",
          display: "flex",
          gap: "6px",
        }}
      >
        <span style={{ textTransform: "capitalize" }}>{item.slot.replace(/_/g, " ")}</span>
        {item.itemPower !== undefined && (
          <>
            <span>·</span>
            <span>{item.itemPower} Item Power</span>
          </>
        )}
      </div>

      {/* Aspect (for legendaries) */}
      {aspectEntry && (
        <div
          style={{
            color: "var(--rarity-legendary)",
            fontSize: "11px",
            fontStyle: "italic",
          }}
        >
          {aspectEntry.label}
        </div>
      )}

      {/* Affixes (implicits + explicits + tempered combined for display) */}
      {allAffixes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {allAffixes.map((affix, i) => (
            <AffixRow key={i} affixId={affix.affixId} rolledValue={affix.rolledValue} />
          ))}
        </div>
      )}
    </div>
  );
}
