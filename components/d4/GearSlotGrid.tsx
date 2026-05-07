import { ItemCard } from "./ItemCard";

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

type GearSlotGridProps = {
  items: Record<string, Item>;
};

const GEAR_SLOTS = [
  { id: "helm", label: "Helm", cluster: "armor" },
  { id: "chest", label: "Chest", cluster: "armor" },
  { id: "gloves", label: "Gloves", cluster: "armor" },
  { id: "pants", label: "Pants", cluster: "armor" },
  { id: "boots", label: "Boots", cluster: "armor" },
  { id: "mainHand", label: "Main Hand", cluster: "weapon" },
  { id: "offHand", label: "Off Hand", cluster: "weapon" },
  { id: "weapon3", label: "2H Bludgeoning", cluster: "weapon", classSpecific: true },
  { id: "weapon4", label: "2H Slashing", cluster: "weapon", classSpecific: true },
  { id: "weapon5", label: "1H Off-Weapon", cluster: "weapon", classSpecific: true },
  { id: "amulet", label: "Amulet", cluster: "jewelry" },
  { id: "ring1", label: "Ring 1", cluster: "jewelry" },
  { id: "ring2", label: "Ring 2", cluster: "jewelry" },
] as const;

function EmptySlot({ label }: { label: string }) {
  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px dashed var(--stone-700)",
        padding: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "48px",
        color: "var(--stone-600)",
        fontSize: "11px",
      }}
    >
      {label}
    </div>
  );
}

function ClusterSection({
  title,
  slots,
  items,
}: {
  title: string;
  slots: readonly { id: string; label: string; cluster: string }[];
  items: Record<string, Item>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--stone-500)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          paddingBottom: "4px",
          borderBottom: "1px solid var(--stone-800)",
        }}
      >
        {title}
      </div>
      {slots.map((slot) => {
        const item = items[slot.id];
        return item ? (
          <ItemCard key={slot.id} item={item} />
        ) : (
          <EmptySlot key={slot.id} label={slot.label} />
        );
      })}
    </div>
  );
}

export function GearSlotGrid({ items }: GearSlotGridProps) {
  const armorSlots = GEAR_SLOTS.filter((s) => s.cluster === "armor");
  const weaponSlots = GEAR_SLOTS.filter((s) => s.cluster === "weapon");
  const jewelrySlots = GEAR_SLOTS.filter((s) => s.cluster === "jewelry");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Top row: armor + jewelry */}
      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
        <ClusterSection title="Armor" slots={armorSlots} items={items} />
        <ClusterSection title="Jewelry" slots={jewelrySlots} items={items} />
      </div>
      {/* Bottom row: weapons */}
      <ClusterSection title="Weapons" slots={weaponSlots} items={items} />
    </div>
  );
}
