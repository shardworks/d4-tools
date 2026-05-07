"use client";

import { useFormContext, useFieldArray, Controller } from "react-hook-form";
import { getParagonCatalogForClass, getParagonPointsAvailable } from "@/lib/catalog";
import type { Character } from "@/lib/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { X, Plus } from "lucide-react";

interface ParagonAllocatorProps {
  /** Character's class (drives which boards/glyphs are available) */
  className: string;
}

/**
 * Coarse paragon allocation editor (D12):
 * - One row per board, showing name + spent points + optional glyph.
 * - Total spent points validated against paragonLevel from game-math.
 * - Data model stores boards, nodes (for future visual rendering), glyphs.
 */
export function ParagonAllocator({ className: charClass }: ParagonAllocatorProps) {
  const {
    control,
    register,
    watch,
    formState: { errors },
  } = useFormContext<Character>();

  const { fields, append, remove } = useFieldArray<Character>({
    control,
    name: "paragonAllocation.boards" as never,
  });

  const paragonLevel = watch("paragonAllocation.paragonLevel") ?? 0;
  const boards = watch("paragonAllocation.boards") ?? [];
  const catalog = getParagonCatalogForClass(charClass);
  const budget = getParagonPointsAvailable(paragonLevel);
  const totalSpent = boards.reduce((sum, b) => sum + (b.spentPoints ?? 0), 0);
  const overBudget = totalSpent > budget;

  function addBoard() {
    const first = catalog.boards[0];
    append({
      boardId: first?.id ?? "custom",
      boardName: first?.label ?? "New Board",
      spentPoints: 0,
      nodes: [],
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Paragon level */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <label style={{ fontSize: "13px", color: "var(--stone-300)", minWidth: "110px" }}>
          Paragon Level
        </label>
        <Input
          type="number"
          min={0}
          max={300}
          {...register("paragonAllocation.paragonLevel", { valueAsNumber: true })}
          style={{ width: "80px" }}
        />
        {errors.paragonAllocation?.paragonLevel && (
          <span style={{ color: "var(--destructive, #ef4444)", fontSize: "12px" }}>
            {errors.paragonAllocation.paragonLevel.message}
          </span>
        )}
      </div>

      {/* Points budget indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontSize: "13px", color: "var(--stone-400)" }}>
          Points Allocated:{" "}
          <strong
            style={{ color: overBudget ? "var(--destructive, #ef4444)" : "var(--stone-100)" }}
          >
            {totalSpent}
          </strong>{" "}
          / {budget}
        </span>
        {overBudget && (
          <Badge variant="destructive" style={{ fontSize: "11px" }}>
            Over budget
          </Badge>
        )}
      </div>

      <Separator />

      {/* Boards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--stone-500)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Paragon Boards
        </div>

        {fields.map((field, index) => (
          <div
            key={field.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              padding: "10px",
              border: "1px solid var(--stone-700)",
              borderRadius: "var(--radius-card, 6px)",
              background: "var(--surface-2, rgba(255,255,255,0.03))",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {/* Board selector */}
              <Controller
                control={control}
                name={`paragonAllocation.boards.${index}.boardId` as never}
                render={({ field: f }) => (
                  <Select
                    value={f.value as string}
                    onValueChange={(val) => {
                      f.onChange(val);
                      const board = catalog.boards.find((b) => b.id === val);
                      if (board) {
                        // Also update boardName via separate register binding
                      }
                    }}
                  >
                    <SelectTrigger style={{ flex: 1, height: "32px", fontSize: "13px" }}>
                      <SelectValue placeholder="Select board…" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.boards.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.label}
                          {b.isStarterBoard && (
                            <span style={{ color: "var(--stone-500)", marginLeft: "6px" }}>
                              (starter)
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />

              {/* Spent points */}
              <Input
                type="number"
                min={0}
                max={budget}
                placeholder="Points"
                {...register(`paragonAllocation.boards.${index}.spentPoints` as never, {
                  valueAsNumber: true,
                })}
                style={{ width: "72px" }}
              />
              <span style={{ fontSize: "11px", color: "var(--stone-600)" }}>pts</span>

              <button
                type="button"
                onClick={() => remove(index)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--stone-500)",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                }}
                aria-label="Remove board"
              >
                <X size={14} />
              </button>
            </div>

            {/* Glyph selector */}
            {catalog.glyphs.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--stone-500)", minWidth: "50px" }}>
                  Glyph:
                </span>
                <Controller
                  control={control}
                  name={`paragonAllocation.boards.${index}.glyph.glyphId` as never}
                  render={({ field: f }) => (
                    <Select
                      value={(f.value as string) ?? "__none__"}
                      onValueChange={(val) => f.onChange(val === "__none__" ? undefined : val)}
                    >
                      <SelectTrigger style={{ flex: 1, height: "28px", fontSize: "12px" }}>
                        <SelectValue placeholder="No glyph" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No glyph</SelectItem>
                        {catalog.glyphs.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <span style={{ fontSize: "12px", color: "var(--stone-500)" }}>Lvl:</span>
                <Input
                  type="number"
                  min={1}
                  max={21}
                  placeholder="1"
                  {...register(`paragonAllocation.boards.${index}.glyph.level` as never, {
                    valueAsNumber: true,
                  })}
                  style={{ width: "52px" }}
                />
              </div>
            )}
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addBoard}
          style={{ alignSelf: "flex-start", gap: "6px" }}
        >
          <Plus size={14} />
          Add Board
        </Button>
      </div>
    </div>
  );
}
