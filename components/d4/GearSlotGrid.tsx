"use client";

import { useState } from "react";
import { ItemCard } from "./ItemCard";
import { GearSlotEditor } from "./GearSlotEditor";
import { getSlotsForClass, type SlotEntry } from "@/lib/catalog";
import type { Item } from "@/lib/schema";

interface GearSlotGridProps {
  items: Record<string, Item>;
  /** Character class — determines which slots appear (e.g. Barbarian dual-2H) */
  characterClass: string;
  /** Called when an item is saved in the slot editor */
  onItemSave?: (slotId: string, item: Item) => Promise<void>;
  /** Called when an item is removed from a slot */
  onItemRemove?: (slotId: string) => Promise<void>;
  /** If false, clicking slots is read-only (no sheet opens). Defaults to false. */
  editable?: boolean;
}

function EmptySlot({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
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
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 100ms",
      }}
      onMouseEnter={(e) => {
        if (onClick) (e.currentTarget as HTMLElement).style.borderColor = "var(--stone-500)";
      }}
      onMouseLeave={(e) => {
        if (onClick) (e.currentTarget as HTMLElement).style.borderColor = "var(--stone-700)";
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
  editable,
  onSlotClick,
}: {
  title: string;
  slots: SlotEntry[];
  items: Record<string, Item>;
  editable: boolean;
  onSlotClick: (slot: SlotEntry) => void;
}) {
  if (slots.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 flex-1 min-w-0">
      <div className="mini-label tracking-[0.08em] pb-1 border-b border-stone-800">
        {title}
      </div>
      {slots.map((slot) => {
        const item = items[slot.id];
        return item ? (
          <div
            key={slot.id}
            onClick={editable ? () => onSlotClick(slot) : undefined}
            className={editable ? "cursor-pointer" : "cursor-default"}
          >
            <ItemCard item={item} />
          </div>
        ) : (
          <EmptySlot
            key={slot.id}
            label={slot.label}
            onClick={editable ? () => onSlotClick(slot) : undefined}
          />
        );
      })}
    </div>
  );
}

/**
 * GearSlotGrid — renders all gear slots grouped by cluster (armor / jewelry / weapons).
 *
 * Uses the canonical slot catalog (lib/catalog/slots.json). No invented weapon3/4/5 IDs.
 * Barbarian dual-2H slots (barb_1h_main, barb_1h_off, barb_2h_bludgeoning, barb_2h_slashing)
 * appear only when characterClass === "Barbarian".
 *
 * When editable=true, clicking a slot opens the GearSlotEditor side sheet.
 * Note: EmptySlot imperative hover (onMouseEnter/onMouseLeave) is out-of-scope
 * per foundation-audit-2026-05-08.md §3.2.
 */
export function GearSlotGrid({
  items,
  characterClass,
  onItemSave,
  onItemRemove,
  editable = false,
}: GearSlotGridProps) {
  const [editingSlot, setEditingSlot] = useState<SlotEntry | null>(null);

  const allSlots = getSlotsForClass(characterClass);
  const armorSlots = allSlots.filter((s) => s.cluster === "armor");
  const jewelrySlots = allSlots.filter((s) => s.cluster === "jewelry");
  const weaponSlots = allSlots.filter((s) => s.cluster === "weapon");

  async function handleSave(item: Item) {
    if (!editingSlot || !onItemSave) return;
    await onItemSave(editingSlot.id, { ...item, slot: editingSlot.id });
  }

  async function handleRemove() {
    if (!editingSlot || !onItemRemove) return;
    await onItemRemove(editingSlot.id);
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Top row: armor + jewelry */}
        <div className="flex gap-4 items-start">
          <ClusterSection
            title="Armor"
            slots={armorSlots}
            items={items}
            editable={editable}
            onSlotClick={setEditingSlot}
          />
          <ClusterSection
            title="Jewelry"
            slots={jewelrySlots}
            items={items}
            editable={editable}
            onSlotClick={setEditingSlot}
          />
        </div>

        {/* Bottom row: weapons */}
        <ClusterSection
          title="Weapons"
          slots={weaponSlots}
          items={items}
          editable={editable}
          onSlotClick={setEditingSlot}
        />
      </div>

      {/* Gear slot editor sheet (visual-spec §9.6 / D20) */}
      {editingSlot && (
        <GearSlotEditor
          slot={editingSlot}
          item={items[editingSlot.id]}
          characterClass={characterClass}
          open={!!editingSlot}
          onOpenChange={(open) => {
            if (!open) setEditingSlot(null);
          }}
          onSave={handleSave}
          onRemove={items[editingSlot.id] ? handleRemove : undefined}
        />
      )}
    </>
  );
}
