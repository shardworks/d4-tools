"use client";

import { useState, useCallback } from "react";
import { useForm, FormProvider, Controller, useFieldArray, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ItemSchema, type Item, type AffixInstance, ITEM_RARITIES } from "@/lib/schema";
import { getAffixesForSlotAndClass } from "@/lib/catalog";
import type { SlotEntry, AffixEntry } from "@/lib/catalog";
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

/**
 * AffixRow — a single affix entry within the item editor.
 * Shows: combobox picker + value input + out-of-range indicator.
 */
function AffixRow({
  fieldIndex,
  fieldPath,
  slotId,
  characterClass,
  remove,
}: {
  fieldIndex: number;
  fieldPath: "implicits" | "explicits" | "tempered";
  slotId: string;
  characterClass: string;
  remove: (index: number) => void;
}) {
  const { watch, setValue } = useForm<ItemInput>();
  // We're inside a FormProvider; use separate value tracking via parent context

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      {/* Affix combobox injected from parent — this row is actually rendered inline */}
      <span style={{ fontSize: "12px", color: "var(--stone-600)" }}>{fieldIndex + 1}.</span>
      <button
        type="button"
        onClick={() => remove(fieldIndex)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--stone-600)",
          padding: "2px",
          display: "flex",
          alignItems: "center",
        }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

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
  const eligibleAffixes = getAffixesForSlotAndClass(slotId, characterClass);

  function getAffixEntry(affixId: string): AffixEntry | undefined {
    return eligibleAffixes.find((a) => a.id === affixId);
  }

  function isGreater(affixId: string, value: number): boolean {
    const entry = getAffixEntry(affixId);
    if (!entry) return false;
    const max = entry.valueRange[1];
    return value >= max;
  }

  function isOutOfRange(affixId: string, value: number): string | null {
    const entry = getAffixEntry(affixId);
    if (!entry) return null;
    const [min, max] = entry.valueRange;
    if (value < min) return `Min is ${min}`;
    if (value > max) return `Max is ${max}`;
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--stone-500)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {label}
        </span>
        {(!maxRows || fields.length < maxRows) && (
          <button
            type="button"
            onClick={() => append({ affixId: "", rolledValue: 0 } as never)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--stone-400)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              padding: "2px 4px",
            }}
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
          <div key={field.id} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ flex: 1 }}>
                <Controller
                  control={control}
                  name={`${name}.${i}.affixId` as never}
                  render={({ field: f }) => (
                    <AffixCombobox
                      slotId={slotId}
                      className={characterClass}
                      value={f.value as string}
                      onSelect={(id) => {
                        f.onChange(id);
                        const newEntry = getAffixEntry(id);
                        if (newEntry) {
                          // Set default value to midpoint
                          const mid = (newEntry.valueRange[0] + newEntry.valueRange[1]) / 2;
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
                    style={{
                      width: "72px",
                      fontSize: "12px",
                      borderColor: outOfRange ? "var(--destructive, #ef4444)" : undefined,
                      color: greater ? "var(--mythic, #d4a017)" : undefined,
                    }}
                  />
                )}
              />
              {entry && (
                <span style={{ fontSize: "10px", color: "var(--stone-600)", whiteSpace: "nowrap" }}>
                  {entry.isPercent ? "%" : ""}
                </span>
              )}
              {greater && (
                <Badge style={{ fontSize: "9px", padding: "1px 4px", background: "rgba(212,160,23,0.15)", color: "var(--mythic, #d4a017)", border: "1px solid rgba(212,160,23,0.4)" }}>
                  GA
                </Badge>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--stone-600)",
                  padding: "2px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <X size={12} />
              </button>
            </div>
            {outOfRange && (
              <p style={{ color: "var(--destructive, #ef4444)", fontSize: "11px", margin: 0, paddingLeft: "4px" }}>
                {outOfRange}
              </p>
            )}
          </div>
        );
      })}

      {fields.length === 0 && (
        <span style={{ fontSize: "12px", color: "var(--stone-700)", fontStyle: "italic" }}>
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

  const rarity = watch("rarity") as string;
  const isAncestral = watch("isAncestral") as boolean;
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

  const rarityColor: Record<string, string> = {
    common: "var(--stone-400)",
    magic: "#5599ff",
    rare: "#f0c040",
    legendary: "var(--legendary, #c87f27)",
    unique: "#8b5e3c",
    mythic: "#d4a017",
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        style={{ width: "520px", maxWidth: "100vw", overflowY: "auto", padding: "24px" }}
      >
        <SheetHeader style={{ marginBottom: "16px" }}>
          <SheetTitle style={{ color: "var(--stone-100)", fontSize: "16px" }}>
            {slot.label}
          </SheetTitle>
        </SheetHeader>

        <FormProvider {...form}>
          <form onSubmit={handleSubmit(onSubmit as never)} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Rarity + Item Power */}
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <Label style={{ fontSize: "11px" }}>Rarity</Label>
                <Controller
                  control={control}
                  name="rarity"
                  render={({ field: f }) => (
                    <Select value={f.value as string} onValueChange={f.onChange}>
                      <SelectTrigger style={{ width: "140px", height: "32px", fontSize: "12px", color: rarityColor[f.value as string] ?? "var(--stone-100)" }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEM_RARITIES.map((r) => (
                          <SelectItem key={r} value={r} style={{ fontSize: "12px" }}>
                            {RARITY_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <Label style={{ fontSize: "11px" }}>Item Power</Label>
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  {...register("itemPower", { valueAsNumber: true })}
                  style={{ width: "90px", height: "32px", fontSize: "12px" }}
                  placeholder="925"
                />
              </div>

              {/* Ancestral toggle */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
                <Label style={{ fontSize: "11px" }}>Ancestral</Label>
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
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <Label style={{ fontSize: "11px" }}>Item Name (optional)</Label>
              <Input
                {...register("name")}
                placeholder="Unique item name…"
                style={{ fontSize: "12px" }}
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
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--stone-500)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Aspect
                </span>
                {aspectId && (
                  <button
                    type="button"
                    onClick={() => {
                      setValue("aspect", undefined as never);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--stone-600)",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "11px",
                    }}
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
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <Controller
                    control={control}
                    name="aspect.rolledValue"
                    render={({ field: f }) => (
                      <Input
                        type="number"
                        step="0.1"
                        value={f.value as number}
                        onChange={(e) => f.onChange(parseFloat(e.target.value) || 0)}
                        style={{ width: "80px", fontSize: "12px" }}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name="aspect.source"
                    render={({ field: f }) => (
                      <Select value={f.value as string} onValueChange={f.onChange}>
                        <SelectTrigger style={{ width: "120px", height: "32px", fontSize: "12px" }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="codex" style={{ fontSize: "12px" }}>Codex of Power</SelectItem>
                          <SelectItem value="legendary" style={{ fontSize: "12px" }}>Legendary Drop</SelectItem>
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
              <p style={{ color: "var(--destructive, #ef4444)", fontSize: "12px" }}>{saveError}</p>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
              <Button type="submit" disabled={isSaving} style={{ gap: "6px" }}>
                <Save size={13} />
                {isSaving ? "Saving…" : "Save Item"}
              </Button>
              {item && onRemove && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRemove}
                  style={{ gap: "6px", color: "var(--destructive, #ef4444)" }}
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
