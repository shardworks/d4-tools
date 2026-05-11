"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getAffixesForSlotAndClass, getAffixValueRangeAtItemPower, type AffixEntry } from "@/lib/catalog";
import type { AffixPosition } from "@/lib/triage/resolve";

interface AffixComboboxProps {
  slotId: string;
  className: string;
  value: string | undefined;
  onSelect: (affixId: string, entry: AffixEntry) => void;
  placeholder?: string;
  /**
   * When set, filters affix candidates by position:
   *  - `"implicit"` — shows only entries where `isImplicit === true`.
   *  - `"explicit"` — shows entries where `isImplicit` is falsy (absent or false).
   * When omitted, all candidates for the slot/class are shown (no position filter).
   */
  position?: AffixPosition;
}

/**
 * Search-filterable affix picker (visual-spec §9.3, D19).
 * Uses shadcn Popover wrapping Command primitive, filtered by slot/class restrictions.
 * Optionally filtered by position (implicit vs. explicit) to prevent routing an implicit
 * affix into an explicit slot or vice versa (v18 D4).
 */
export function AffixCombobox({
  slotId,
  className: charClass,
  value,
  onSelect,
  placeholder = "Pick an affix…",
  position,
}: AffixComboboxProps) {
  const [open, setOpen] = useState(false);

  const slotClassAffixes = getAffixesForSlotAndClass(slotId, charClass);
  const eligibleAffixes = position === undefined
    ? slotClassAffixes
    : position === "implicit"
      ? slotClassAffixes.filter((a) => a.isImplicit === true)
      : slotClassAffixes.filter((a) => !a.isImplicit);
  const selected = eligibleAffixes.find((a) => a.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between text-xs h-[30px] font-normal overflow-hidden text-ellipsis",
            selected ? "text-stone-100" : "text-stone-500"
          )}
        >
          <span className="overflow-hidden text-ellipsis whitespace-nowrap flex-1 text-left">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-1 shrink-0" size={12} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search affixes…" />
          <CommandList>
            <CommandEmpty>No affixes found.</CommandEmpty>
            <CommandGroup>
              {eligibleAffixes.map((affix) => (
                <CommandItem
                  key={affix.id}
                  value={affix.label}
                  onSelect={() => {
                    onSelect(affix.id, affix);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check
                    className={cn("mr-2", value === affix.id ? "opacity-100" : "opacity-0")}
                    size={12}
                  />
                  <span className="flex-1">{affix.label}</span>
                  {(() => {
                    const { min, max } = getAffixValueRangeAtItemPower(affix);
                    return (
                      <span className="text-stone-500 text-[11px] ml-2 tabular-nums">
                        {min}–{max}
                        {affix.isPercent ? "%" : ""}
                      </span>
                    );
                  })()}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
