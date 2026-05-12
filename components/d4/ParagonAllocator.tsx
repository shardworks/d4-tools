"use client";

import { useFormContext, useFieldArray, Controller } from "react-hook-form";
import {
  getParagonCatalogForClass,
  getParagonPointsAvailable,
  findParagonBoardById,
  findParagonGlyphById,
} from "@/lib/catalog";
import type { Character } from "@/lib/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <div className="flex flex-col gap-4">
      {/* Paragon level */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-stone-300 min-w-[110px]">
          Paragon Level
        </label>
        <Input
          type="number"
          min={0}
          max={300}
          {...register("paragonAllocation.paragonLevel", { valueAsNumber: true })}
          className="w-20"
        />
        {errors.paragonAllocation?.paragonLevel && (
          <span className="error-text text-xs">
            {errors.paragonAllocation.paragonLevel.message}
          </span>
        )}
      </div>

      {/* Points budget indicator */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-stone-400">
          Points Allocated:{" "}
          <strong className={cn("tabular-nums", overBudget ? "text-destructive" : "text-stone-100")}>
            {totalSpent}
          </strong>{" "}
          / <span className="tabular-nums">{budget}</span>
        </span>
        {overBudget && (
          <Badge variant="destructive" className="text-[11px]">
            Over budget
          </Badge>
        )}
      </div>

      <Separator />

      {/* Boards */}
      <div className="flex flex-col gap-3">
        <div className="mini-label tracking-[0.08em]">
          Paragon Boards
        </div>

        {fields.map((field, index) => (
          <div
            key={field.id}
            className="panel flex flex-col gap-2 p-[10px]"
          >
            <div className="flex items-center gap-2">
              {/* Board selector */}
              <Controller
                control={control}
                name={`paragonAllocation.boards.${index}.boardId` as never}
                render={({ field: f }) => {
                  const rawBoardId = f.value as string;
                  const resolvedBoard = rawBoardId
                    ? findParagonBoardById(charClass, rawBoardId)
                    : undefined;
                  if (rawBoardId && !resolvedBoard) {
                    console.warn(
                      `[ParagonAllocator] unresolvable boardId "${rawBoardId}" for class ${charClass} — reverting to placeholder`
                    );
                  }
                  return (
                    <Select
                      value={resolvedBoard?.id ?? ""}
                      onValueChange={(val) => {
                        f.onChange(val);
                        const board = catalog.boards.find((b) => b.id === val);
                        if (board) {
                          // Also update boardName via separate register binding
                        }
                      }}
                    >
                      <SelectTrigger className="flex-1 h-8 text-sm">
                        <SelectValue placeholder="Select board…" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalog.boards.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.label}
                            {b.isStarterBoard && (
                              <span className="text-stone-500 ml-[6px]">
                                (starter)
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }}
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
                className="w-[72px]"
              />
              <span className="text-[11px] text-stone-600">pts</span>

              <button
                type="button"
                onClick={() => remove(index)}
                className="icon-btn text-stone-500 p-1"
                aria-label="Remove board"
              >
                <X size={14} />
              </button>
            </div>

            {/* Glyph selector */}
            {catalog.glyphs.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-500 min-w-[50px]">
                  Glyph:
                </span>
                <Controller
                  control={control}
                  name={`paragonAllocation.boards.${index}.glyph.glyphId` as never}
                  render={({ field: f }) => {
                    const rawGlyphId = f.value as string | undefined;
                    const hasGlyph = rawGlyphId && rawGlyphId !== "__none__";
                    const resolvedGlyph = hasGlyph
                      ? findParagonGlyphById(charClass, rawGlyphId)
                      : undefined;
                    if (hasGlyph && !resolvedGlyph) {
                      console.warn(
                        `[ParagonAllocator] unresolvable glyphId "${rawGlyphId}" for class ${charClass} — reverting to no glyph`
                      );
                    }
                    return (
                      <Select
                        value={resolvedGlyph?.id ?? "__none__"}
                        onValueChange={(val) => f.onChange(val === "__none__" ? undefined : val)}
                      >
                        <SelectTrigger className="flex-1 h-7 text-xs">
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
                    );
                  }}
                />
                <span className="text-xs text-stone-500">Lvl:</span>
                <Input
                  type="number"
                  min={1}
                  max={21}
                  placeholder="1"
                  {...register(`paragonAllocation.boards.${index}.glyph.level` as never, {
                    valueAsNumber: true,
                  })}
                  className="w-[52px]"
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
          className="self-start gap-[6px]"
        >
          <Plus size={14} />
          Add Board
        </Button>
      </div>
    </div>
  );
}
