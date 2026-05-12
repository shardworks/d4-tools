"use client";

import { useState, useCallback } from "react";
import { useForm, FormProvider, Controller, useFieldArray, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ItemSchema, type Item, type AffixInstance, ITEM_RARITIES } from "@/lib/schema";
import { getAffixesForSlotAndClass, getAffixValueRangeAtItemPower } from "@/lib/catalog";
import type { SlotEntry, AffixEntry } from "@/lib/catalog";
import type { AffixPosition } from "@/lib/triage/resolve";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AffixCombobox } from "./AffixCombobox";
import { AspectCombobox } from "./AspectCombobox";
import { Plus, Trash2, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface GearSlotEditorProps {
  slot: SlotEntry;
  item: Item | undefined;
  /** Character class — filters affix/aspect catalogs */
  characterClass: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (item: Item) => Promise<void>;
  onRemove?: () => Promise<void>;
}

type ItemInput = z.input<typeof ItemSchema>;

const RARITY_LABELS: Record<string, string> = {
  common: "Common",
  magic: "Magic",
  rare: "Rare",
  legendary: "Legendary",
  unique: "Unique",
  mythic: "Mythic Unique",
};

/** Canonical rarity-color map — mirrors ItemCard.tsx (D4). */
const rarityColor: Record<string, string> = {
  common: "var(--rarity-common)",
  magic: "var(--rarity-magic)",
  rare: "var(--rarity-rare)",
  legendary: "var(--rarity-legendary)",
  unique: "var(--rarity-unique)",
  mythic: "var(--rarity-mythic)",
};

/**
 * InlineAffixList — renders a list of AffixInstance fields with combobox + value input.
 * Validates each value against catalog min/max (D8, Greater Affix derivation).
 */
function InlineAffixList({
  name,
  label,
  slotId,
  characterClass,
  control,
  watch,
  setValue,
  maxRows,
}: {
  name: "implicits" | "explicits" | "tempered";
  label: string;
  slotId: string;
  characterClass: string;
  control: ReturnType<typeof useForm<ItemInput>>["control"];
  watch: ReturnType<typeof useForm<ItemInput>>["watch"];
  setValue: ReturnType<typeof useForm<ItemInput>>["setValue"];
  maxRows?: number;
}) {
  const { fields, append, remove } = useFieldArray({ control, name } as never);
  const values = watch(name) as AffixInstance[] | undefined ?? [];
  // Derive position from the affix group name: implicits use the implicit pool;
  // explicits and tempered share the explicit pool (tempered has no separate catalog axis).
  const position: AffixPosition = name === "implicits" ? "implicit" : "explicit";
  const eligibleAffixes = getAffixesForSlotAndClass(slotId, characterClass);

  function getAffixEntry(affixId: string): AffixEntry | undefined {
    return eligibleAffixes.find((a) => a.id === affixId);
  }

  function isGreater(affixId: string, value: number): boolean {
    const entry = getAffixEntry(affixId);
    if (!entry) return false;
    const { max } = getAffixValueRangeAtItemPower(entry);
    return value >= max;
  }

  function isOutOfRange(affixId: string, value: number): string | null {
    const entry = getAffixEntry(affixId);
    if (!entry) return null;
    const { min, max } = getAffixValueRangeAtItemPower(entry);
    if (value < min) return `Min is ${min}`;
    if (value > max) return `Max is ${max}`;
    return null;
  }

  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex items-center justify-between">
        <span className="mini-label">{label}</span>
        {(!maxRows || fields.length < maxRows) && (
          <button
            type="button"
            onClick={() => append({ affixId: "", rolledValue: 0 } as never)}
            className="icon-btn gap-1 text-[11px] text-stone-400 px-1"
          >
            <Plus size={11} /> Add
          </button>
        )}
      </div>

      {fields.map((field, i) => {
        const affixId = (values[i] as AffixInstance | undefined)?.affixId ?? "";
        const rolledValue = (values[i] as AffixInstance | undefined)?.rolledValue ?? 0;
        const outOfRange = affixId ? isOutOfRange(affixId, rolledValue) : null;
        const greater = affixId ? isGreater(affixId, rolledValue) : false;
        const entry = getAffixEntry(affixId);

        return (
          <div key={field.id} className="flex flex-col gap-[3px]">
            <div className="flex items-center gap-[6px]">
              <div className="flex-1">
                <Controller
                  control={control}
                  name={`${name}.${i}.affixId` as never}
                  render={({ field: f }) => (
                    <AffixCombobox
                      slotId={slotId}
                      className={characterClass}
                      value={f.value as string}
                      position={position}
                      onSelect={(id) => {
                        f.onChange(id);
                        const newEntry = getAffixEntry(id);
                        if (newEntry) {
                          // Set default value to midpoint of last band
                          const { min: bMin, max: bMax } = getAffixValueRangeAtItemPower(newEntry);
                          const mid = (bMin + bMax) / 2;
                          setValue(`${name}.${i}.rolledValue` as never, Math.round(mid * 10) / 10 as never);
                        }
                      }}
                    />
                  )}
                />
              </div>
              <Controller
                control={control}
                name={`${name}.${i}.rolledValue` as never}
                render={({ field: f }) => (
                  <Input
                    type="number"
                    step="0.1"
                    value={f.value as number}
                    onChange={(e) => f.onChange(parseFloat(e.target.value) || 0)}
                    className={cn(
                      "w-[72px] text-xs",
                      outOfRange && "border-destructive",
                      greater && "text-rarity-mythic"
                    )}
                  />
                )}
              />
              {entry && (
                <span className="text-[10px] text-stone-600 whitespace-nowrap">
                  {entry.isPercent ? "%" : ""}
                </span>
              )}
              {greater && (
                <Badge className="text-[9px] px-1 py-0 text-rarity-mythic border-rarity-mythic/40 bg-rarity-mythic/15">
                  GA
                </Badge>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                className="icon-btn text-stone-600"
              >
                <X size={12} />
              </button>
            </div>
            {outOfRange && (
              <p className="error-text text-[11px] m-0 pl-1">
                {outOfRange}
              </p>
            )}
          </div>
        );
      })}

      {fields.length === 0 && (
        <span className="text-xs text-stone-700 italic">
          None
        </span>
      )}
    </div>
  );
}

/**
 * GearSlotEditor — 520px right-side sheet for editing a single item slot.
 * Implements visual-spec §9.6, D20 (side sheet), D19 (search-filterable pickers).
 */
export function GearSlotEditor({
  slot,
  item,
  characterClass,
  open,
  onOpenChange,
  onSave,
  onRemove,
}: GearSlotEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const defaultItem: ItemInput = item ?? {
    slot: slot.id,
    name: "",
    rarity: "rare",
    itemPower: undefined,
    isAncestral: false,
    implicits: [],
    explicits: [],
    tempered: [],
    aspect: undefined,
    masterworkRank: 0,
    runes: [],
    sockets: [],
  };

  const form = useForm<ItemInput, unknown, Item>({
    resolver: zodResolver(ItemSchema) as unknown as Resolver<ItemInput, unknown, Item>,
    defaultValues: defaultItem,
  });

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = form;

  const aspectId = (watch("aspect.aspectId") ?? "") as string;

  async function onSubmit(data: Item) {
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(data);
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove() {
    if (!onRemove) return;
    if (!confirm("Remove this item from the slot?")) return;
    try {
      await onRemove();
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Remove failed");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="max-w-[100vw] overflow-y-auto p-6"
        style={{ width: "520px" }}
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-stone-100 text-md">
            {slot.label}
          </SheetTitle>
        </SheetHeader>

        <FormProvider {...form}>
          <form onSubmit={handleSubmit(onSubmit as never)} className="flex flex-col gap-4">
            {/* Rarity + Item Power */}
            <div className="flex gap-3 items-end">
              <div className="flex flex-col gap-1">
                <Label className="text-[11px]">Rarity</Label>
                <Controller
                  control={control}
                  name="rarity"
                  render={({ field: f }) => (
                    <Select value={f.value as string} onValueChange={f.onChange}>
                      <SelectTrigger
                        className="w-[140px] text-xs"
                        style={{ color: rarityColor[f.value as string] ?? "var(--stone-100)" }}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEM_RARITIES.map((r) => (
                          <SelectItem key={r} value={r} className="text-xs">
                            {RARITY_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-[11px]">Item Power</Label>
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  {...register("itemPower", { valueAsNumber: true })}
                  className="w-[90px] text-xs"
                  placeholder="925"
                />
              </div>

              {/* Ancestral toggle */}
              <div className="flex flex-col gap-1 items-center">
                <Label className="text-[11px]">Ancestral</Label>
                <Controller
                  control={control}
                  name="isAncestral"
                  render={({ field: f }) => (
                    <Switch
                      checked={f.value as boolean}
                      onCheckedChange={f.onChange}
                    />
                  )}
                />
              </div>
            </div>

            {/* Item name (optional) */}
            <div className="flex flex-col gap-1">
              <Label className="text-[11px]">Item Name (optional)</Label>
              <Input
                {...register("name")}
                placeholder="Unique item name…"
                className="text-xs"
              />
            </div>

            <Separator />

            {/* Implicits */}
            <InlineAffixList
              name="implicits"
              label="Implicits"
              slotId={slot.id}
              characterClass={characterClass}
              control={control as never}
              watch={watch as never}
              setValue={setValue as never}
              maxRows={2}
            />

            <Separator />

            {/* Explicits */}
            <InlineAffixList
              name="explicits"
              label="Affixes"
              slotId={slot.id}
              characterClass={characterClass}
              control={control as never}
              watch={watch as never}
              setValue={setValue as never}
              maxRows={4}
            />

            <Separator />

            {/* Tempered */}
            <InlineAffixList
              name="tempered"
              label="Tempered"
              slotId={slot.id}
              characterClass={characterClass}
              control={control as never}
              watch={watch as never}
              setValue={setValue as never}
              maxRows={2}
            />

            <Separator />

            {/* Aspect */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="mini-label">Aspect</span>
                {aspectId && (
                  <button
                    type="button"
                    onClick={() => {
                      setValue("aspect", undefined as never);
                    }}
                    className="icon-btn gap-1 text-[11px] text-stone-600"
                  >
                    <X size={11} /> Clear
                  </button>
                )}
              </div>

              <Controller
                control={control}
                name="aspect.aspectId"
                render={({ field: f }) => (
                  <AspectCombobox
                    slotId={slot.id}
                    className={characterClass}
                    value={f.value as string | undefined}
                    onSelect={(id, entry) => {
                      f.onChange(id);
                      const mid = (entry.valueRange[0] + entry.valueRange[1]) / 2;
                      setValue("aspect.rolledValue" as never, Math.round(mid * 10) / 10 as never);
                      setValue("aspect.source" as never, entry.source as never);
                    }}
                  />
                )}
              />

              {aspectId && (
                <div className="flex gap-2 items-center">
                  <Controller
                    control={control}
                    name="aspect.rolledValue"
                    render={({ field: f }) => (
                      <Input
                        type="number"
                        step="0.1"
                        value={f.value as number}
                        onChange={(e) => f.onChange(parseFloat(e.target.value) || 0)}
                        className="w-20 text-xs"
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name="aspect.source"
                    render={({ field: f }) => (
                      <Select value={f.value as string} onValueChange={f.onChange}>
                        <SelectTrigger className="w-[120px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="codex" className="text-xs">Codex of Power</SelectItem>
                          <SelectItem value="legendary" className="text-xs">Legendary Drop</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              )}
            </div>

            <Separator />

            {/* Save error */}
            {saveError && (
              <p className="error-text text-xs m-0">{saveError}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-between">
              <Button type="submit" loading={isSaving} className="gap-[6px]">
                <Save size={13} />
                Save Item
              </Button>
              {item && onRemove && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRemove}
                  className="gap-[6px] text-destructive"
                >
                  <Trash2 size={13} />
                  Remove
                </Button>
              )}
            </div>
          </form>
        </FormProvider>
      </SheetContent>
    </Sheet>
  );
}
