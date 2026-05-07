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
          style={{
            width: "100%",
            justifyContent: "space-between",
            fontSize: "12px",
            height: "30px",
            fontWeight: 400,
            color: selected ? "var(--legendary, #c87f27)" : "var(--stone-500)",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              textAlign: "left",
            }}
          >
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown style={{ marginLeft: "4px", flexShrink: 0 }} size={12} />
        </Button>
      </PopoverTrigger>
      <PopoverContent style={{ width: "400px", padding: 0 }} align="start">
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
                  style={{ fontSize: "12px" }}
                >
                  <Check
                    className={cn("mr-2", value === aspect.id ? "opacity-100" : "opacity-0")}
                    size={12}
                  />
                  <span style={{ flex: 1 }}>{aspect.label}</span>
                  <span
                    style={{
                      color: "var(--stone-500)",
                      fontSize: "11px",
                      marginLeft: "8px",
                      flexShrink: 0,
                    }}
                  >
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
