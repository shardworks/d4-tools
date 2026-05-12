import type { Item } from "@/lib/schema";
import { affixes as affixCatalog, aspects as aspectCatalog, getAffixValueRangeAtItemPower } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

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

function AffixRow({
  affixId,
  rolledValue,
  rolledRange,
}: {
  affixId: string;
  rolledValue?: number;
  rolledRange?: [number, number];
}) {
  const entry = affixCatalog.find((a) => a.id === affixId);
  const label = entry?.label ?? affixId;

  // Weapon-damage implicits supply a min-max range instead of a single value
  if (rolledRange !== undefined) {
    return (
      <div className="flex gap-[6px] items-baseline text-xs">
        <span className="font-mono tabular-nums shrink-0 text-stone-100">
          {rolledRange[0]}–{rolledRange[1]}
        </span>
        <span className="text-stone-400">Damage per Hit</span>
      </div>
    );
  }

  // Standard single-value affix
  const max = entry ? getAffixValueRangeAtItemPower(entry).max : undefined;
  const isGreater = max !== undefined && rolledValue !== undefined && rolledValue >= max;

  return (
    <div className="flex gap-[6px] items-baseline text-xs">
      <span
        className={cn(
          "font-mono tabular-nums shrink-0",
          isGreater ? "text-rarity-mythic" : "text-stone-100"
        )}
      >
        {rolledValue ?? "—"}
        {entry?.isPercent ? "%" : ""}
        {isGreater && <Sparkles size={11} className="inline ml-0.5 text-rarity-mythic" />}
      </span>
      <span className="text-stone-400">{label}</span>
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
      className={cn(
        "rounded bg-surface-2 flex flex-col p-[var(--item-card-padding)] gap-[var(--item-card-row-gap)]",
        item.isAncestral && "ancestral"
      )}
      style={{ border: `1px solid ${borderColor}` }}
    >
      {/* Item name — color is runtime-rarity-driven; static typography uses classes */}
      <div
        className="font-bold text-[13px] leading-[1.2]"
        style={{ color }}
      >
        {displayName}
        {item.isAncestral && (
          <span className="ml-[6px] text-[10px] text-rarity-unique font-normal">
            Ancestral
          </span>
        )}
      </div>

      {/* Slot + power */}
      <div className="flex gap-[6px] text-stone-500 text-[11px]">
        <span className="capitalize">{item.slot.replace(/_/g, " ")}</span>
        {item.itemPower !== undefined && (
          <>
            <span>·</span>
            <span className="tabular-nums">{item.itemPower} Item Power</span>
          </>
        )}
      </div>

      {/* Aspect (for legendaries) */}
      {aspectEntry && (
        <div className="text-rarity-legendary text-[11px] italic">
          {aspectEntry.label}
        </div>
      )}

      {/* Affixes (implicits + explicits + tempered combined for display) */}
      {allAffixes.length > 0 && (
        <div className="flex flex-col gap-[3px]">
          {allAffixes.map((affix, i) => (
            <AffixRow
              key={i}
              affixId={affix.affixId}
              rolledValue={affix.rolledValue}
              rolledRange={affix.rolledRange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
