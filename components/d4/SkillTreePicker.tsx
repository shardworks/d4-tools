"use client";

import { useFormContext, useFieldArray } from "react-hook-form";
import { getSkillsForClass, getSkillPointsAvailable, type SkillEntry } from "@/lib/catalog";
import type { Character } from "@/lib/schema";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface SkillTreePickerProps {
  /** The class for which to load the skill catalog */
  className: string;
  /** Character level — drives the skill points budget */
  level: number;
}

/**
 * Flat skill-rank allocation table backed by React Hook Form.
 * Each row lets the user allocate 0–maxRank points to a skill.
 * Total ranks are validated against skill points available at the current level.
 */
export function SkillTreePicker({ className: charClass, level }: SkillTreePickerProps) {
  const {
    register,
    formState: { errors },
    getValues,
  } = useFormContext<Character>();

  const { fields, replace } = useFieldArray<Character, "skillSelections">({
    name: "skillSelections",
  });

  const skills = getSkillsForClass(charClass);
  const budget = getSkillPointsAvailable(level);

  // Sync the field array whenever the class changes
  // (parent CharacterEditor is responsible for calling replace on class change)

  if (!skills.length) {
    return (
      <div className="text-stone-500 text-sm py-2">
        Skill catalog not available for this class.
      </div>
    );
  }

  // Group skills by category
  const byCategory = skills.reduce<Record<string, SkillEntry[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  const currentSkillSelections = getValues("skillSelections") ?? [];
  const totalRanks = currentSkillSelections.reduce((sum, s) => sum + (s.rank ?? 0), 0);

  // Build a map of fieldIndex by skillId for quick lookup
  const indexBySkillId: Record<string, number> = {};
  fields.forEach((f, i) => {
    indexBySkillId[f.skillId] = i;
  });

  function getRankForSkill(skillId: string): number {
    const idx = indexBySkillId[skillId];
    return idx !== undefined ? (currentSkillSelections[idx]?.rank ?? 0) : 0;
  }

  function handleRankChange(skill: SkillEntry, value: number) {
    const clamped = Math.max(0, Math.min(skill.maxRank, value));
    const existing = currentSkillSelections.map((s) => ({ ...s }));
    const idx = existing.findIndex((s) => s.skillId === skill.id);
    if (idx >= 0) {
      existing[idx].rank = clamped;
    } else {
      existing.push({ skillId: skill.id, rank: clamped, slot: skill.category });
    }
    // Filter out zero-rank entries
    const filtered = existing.filter((s) => s.rank > 0);
    replace(filtered);
  }

  const overBudget = totalRanks > budget;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-stone-400">
          Skill Points Used:{" "}
          <strong className={cn("tabular-nums", overBudget ? "text-destructive" : "text-stone-100")}>
            {totalRanks}
          </strong>{" "}
          / <span className="tabular-nums">{budget}</span>
        </span>
        {overBudget && (
          <Badge variant="destructive" className="text-[11px]">
            Over budget
          </Badge>
        )}
      </div>

      {errors.skillSelections && (
        <p className="error-text text-xs m-0">
          {(errors.skillSelections as { message?: string }).message}
        </p>
      )}

      {Object.entries(byCategory).map(([category, categorySkills]) => (
        <div key={category}>
          <div className="mini-label tracking-[0.08em] mb-2">
            {category.replace("-", " ")}
          </div>
          <div className="flex flex-col gap-1">
            {categorySkills.map((skill) => {
              const rank = getRankForSkill(skill.id);
              return (
                <div
                  key={skill.id}
                  className="flex items-center gap-3 py-1"
                >
                  <span
                    className={cn(
                      "flex-1 text-sm",
                      rank > 0 ? "text-stone-100" : "text-stone-400"
                    )}
                  >
                    {skill.label}
                  </span>
                  <div className="flex items-center gap-[6px]">
                    <Input
                      type="number"
                      min={0}
                      max={skill.maxRank}
                      value={rank}
                      onChange={(e) => handleRankChange(skill, parseInt(e.target.value, 10) || 0)}
                      className="w-[60px] text-center"
                    />
                    <span className="text-[11px] text-stone-600 tabular-nums">
                      / {skill.maxRank}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <Separator className="mt-2" />
        </div>
      ))}
    </div>
  );
}
