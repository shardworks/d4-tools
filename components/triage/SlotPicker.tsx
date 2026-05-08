"use client";

import { slots } from "@/lib/catalog";

interface SlotPickerProps {
  candidates: string[];
  value: string | undefined;
  onChange: (slotId: string) => void;
}

/**
 * Renders slot-choice buttons when the item type resolves to multiple eligible slots.
 * Handles rings (ring1/ring2), Barbarian dual-1H, and Barbarian 2H weapon-class (D19).
 */
export function SlotPicker({ candidates, value, onChange }: SlotPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {candidates.map((slotId) => {
        const slotEntry = slots.find((s) => s.id === slotId);
        const label = slotEntry?.label ?? slotId;
        const isSelected = value === slotId;
        return (
          <button
            key={slotId}
            type="button"
            onClick={() => onChange(slotId)}
            className={
              isSelected
                ? "px-3 py-1 rounded text-xs font-medium bg-accent text-stone-900 border border-accent"
                : "px-3 py-1 rounded text-xs font-medium bg-surface-2 text-stone-300 border border-stone-700 hover:border-stone-500 hover:text-stone-100"
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
