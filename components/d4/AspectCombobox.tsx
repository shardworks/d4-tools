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
import { getAspectsForSlotAndClass, type AspectEntry } from "@/lib/catalog";

interface AspectComboboxProps {
  slotId: string;
  className: string;
  value: string | undefined;
  onSelect: (aspectId: string, entry: AspectEntry) => void;
  placeholder?: string;
}

/**
 * Search-filterable aspect picker (visual-spec §9.3, D19).
 * Uses shadcn Popover + Command, filtered by slot/class restrictions.
 */
export function AspectCombobox({
  slotId,
  className: charClass,
  value,
  onSelect,
  placeholder = "Pick an aspect…",
}: AspectComboboxProps) {
  const [open, setOpen] = useState(false);

  const eligibleAspects = getAspectsForSlotAndClass(slotId, charClass);
  const selected = eligibleAspects.find((a) => a.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between text-xs font-normal overflow-hidden text-ellipsis",
            selected ? "text-rarity-legendary" : "text-stone-500"
          )}
        >
          <span className="overflow-hidden text-ellipsis whitespace-nowrap flex-1 text-left">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-1 shrink-0" size={12} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search aspects…" />
          <CommandList>
            <CommandEmpty>No aspects found for this slot.</CommandEmpty>
            <CommandGroup>
              {eligibleAspects.map((aspect) => (
                <CommandItem
                  key={aspect.id}
                  value={aspect.label}
                  onSelect={() => {
                    onSelect(aspect.id, aspect);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check
                    className={cn("mr-2", value === aspect.id ? "opacity-100" : "opacity-0")}
                    size={12}
                  />
                  <span className="flex-1">{aspect.label}</span>
                  <span className="text-stone-500 text-[11px] ml-2 shrink-0">
                    {aspect.source}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
