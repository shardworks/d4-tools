"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import type { Character, Build, Item } from "@/lib/schema";
import type { DamageConfig } from "@/lib/damage";
import { computeBuildDps } from "@/lib/damage";
import { baseConfig } from "@/lib/damage/client-config";
import { getSkillsForClass, affixes, aspects, uniques } from "@/lib/catalog";
import { formatDps } from "@/components/d4/SkillDpsSection";

interface DpsDeltaSectionProps {
  /** Current character state */
  character: Character;
  /** Active build (used for skillRankMap) */
  build: Build;
  /** Fully-resolved item to simulate equipping */
  newItem: Item;
  /** Slot the item would occupy */
  slotId: string;
  /**
   * Damage config to use. Defaults to baseConfig (bundled baseline).
   * Pass a server-loaded config from loadDamageConfig() to include local overrides.
   */
  config?: DamageConfig;
}

interface PerSkillDelta {
  skillId: string;
  skillLabel: string;
  rank: number;
  currentDps: number;
  newDps: number;
  diff: number;
  /** |diff| / currentDps, or null when currentDps === 0 (first-equip) */
  pctDiff: number | null;
  isFirstEquip: boolean;
}

/**
 * Computes and displays per-skill DPS delta from equipping a candidate item (D37).
 *
 * Shows a table of per-skill DPS changes ordered by absolute delta magnitude (most
 * affected skills first), making the most important signals glanceable.
 *
 * Special cases:
 * - Empty-slot baseline (currentDps === 0): shown as "first-equip" contribution,
 *   not as +∞ or +NaN.
 * - Engine errors (unmapped attribute): surfaces the error message with a config-gap
 *   affordance rather than failing silently.
 * - No damaging skills: shows an informational empty state.
 */
export function DpsDeltaSection({
  character,
  build,
  newItem,
  slotId,
  config: configProp,
}: DpsDeltaSectionProps) {
  const config = configProp ?? baseConfig;

  const result = useMemo(() => {
    const catalog = {
      skills: getSkillsForClass(character.class),
      affixes,
      aspects,
      uniques,
    };

    try {
      const currentResult = computeBuildDps(build, character, catalog, config);

      // Simulate equipping the new item into the slot
      const updatedCharacter: Character = {
        ...character,
        equippedItems: { ...character.equippedItems, [slotId]: newItem },
      };
      const newResult = computeBuildDps(build, updatedCharacter, catalog, config);

      // Build per-skill delta list
      // Merge by skillId across both result sets
      const skillMap = new Map<string, { label: string; rank: number; currentDps: number; newDps: number }>();

      for (const s of currentResult.perSkill) {
        skillMap.set(s.skillId, { label: s.skillLabel, rank: s.rank, currentDps: s.dps, newDps: 0 });
      }
      for (const s of newResult.perSkill) {
        const existing = skillMap.get(s.skillId);
        if (existing) {
          existing.newDps = s.dps;
        } else {
          skillMap.set(s.skillId, { label: s.skillLabel, rank: s.rank, currentDps: 0, newDps: s.dps });
        }
      }

      const perSkillDeltas: PerSkillDelta[] = [];
      for (const [skillId, entry] of skillMap.entries()) {
        const diff = entry.newDps - entry.currentDps;
        const isFirstEquip = entry.currentDps === 0 && entry.newDps > 0;
        const pctDiff = entry.currentDps > 0 ? diff / entry.currentDps : null;
        perSkillDeltas.push({
          skillId,
          skillLabel: entry.label,
          rank: entry.rank,
          currentDps: entry.currentDps,
          newDps: entry.newDps,
          diff,
          pctDiff,
          isFirstEquip,
        });
      }

      // Sort by |diff| descending (most affected skills first per spec glanceability)
      perSkillDeltas.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

      return { perSkillDeltas, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { perSkillDeltas: null, error: message };
    }
  }, [character, build, newItem, slotId, config]);

  // Engine error state — surface config-gap signal rather than "—"
  if (result.error) {
    return (
      <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded px-3 py-2">
        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
        <span>
          <span className="font-medium">Config gap:</span>{" "}
          {result.error}
        </span>
      </div>
    );
  }

  const { perSkillDeltas } = result;

  // No damaging skills
  if (!perSkillDeltas || perSkillDeltas.length === 0) {
    return (
      <div className="text-xs text-stone-600 italic">
        DPS impact unavailable — no damaging skills in active build
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="mini-label tracking-[0.08em]">Sustained Boss DPS Impact</div>
      <div className="rounded border border-stone-800 overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-stone-800 bg-surface-2">
              <th className="text-left px-3 py-1.5 text-[10px] font-medium text-stone-500 uppercase tracking-wide">
                Skill
              </th>
              <th className="text-right px-3 py-1.5 text-[10px] font-medium text-stone-500 uppercase tracking-wide">
                Change
              </th>
              <th className="text-right px-3 py-1.5 text-[10px] font-medium text-stone-500 uppercase tracking-wide">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {perSkillDeltas.map((skill, idx) => (
              <SkillDeltaRow
                key={skill.skillId}
                skill={skill}
                isLast={idx === perSkillDeltas.length - 1}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface SkillDeltaRowProps {
  skill: PerSkillDelta;
  isLast: boolean;
}

function SkillDeltaRow({ skill, isLast }: SkillDeltaRowProps) {
  const isPositive = skill.diff > 0;
  const isNegative = skill.diff < 0;
  const isZero = skill.diff === 0;
  const absDiff = Math.abs(skill.diff);
  const pctLabel = skill.isFirstEquip
    ? "(first-equip)"
    : skill.pctDiff !== null
      ? `${isPositive ? "+" : isNegative ? "-" : ""}${Math.abs(Math.round(skill.pctDiff * 100))}%`
      : null;

  const changeLabel = skill.isFirstEquip
    ? `+${formatDps(absDiff)}`
    : isZero
      ? "—"
      : `${isPositive ? "+" : "-"}${formatDps(absDiff)}`;

  const colorClass = isPositive
    ? "text-green-400"
    : isNegative
      ? "text-red-400"
      : "text-stone-500";

  const Icon = isPositive
    ? TrendingUp
    : isNegative
      ? TrendingDown
      : Minus;

  return (
    <tr className={!isLast ? "border-b border-stone-800/50" : ""}>
      <td className="px-3 py-1.5 text-stone-300">
        <div className="flex items-center gap-1.5">
          <Icon size={11} className={`shrink-0 ${colorClass}`} />
          <span>{skill.skillLabel}</span>
          {skill.rank > 1 && (
            <span className="text-[10px] text-stone-500">r{skill.rank}</span>
          )}
          {skill.isFirstEquip && (
            <span className="text-[10px] text-amber-500 ml-1">(new)</span>
          )}
        </div>
      </td>
      <td className={`px-3 py-1.5 text-right tabular-nums font-mono ${colorClass}`}>
        {changeLabel}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-stone-400">
        {pctLabel ?? "—"}
      </td>
    </tr>
  );
}
