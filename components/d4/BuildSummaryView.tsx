"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { Character, Build, Item } from "@/lib/schema";
import type { DamageConfig } from "@/lib/damage";
import { GearSlotGrid } from "./GearSlotGrid";
import { StatBlock } from "./StatBlock";
import { SkillDpsSection, formatDps } from "./SkillDpsSection";
import { computeBuildDps } from "@/lib/damage";
import { baseConfig } from "@/lib/damage/client-config";
import { getSkillsForClass, affixes, aspects } from "@/lib/catalog";

interface BuildSummaryViewProps {
  character: Character;
  build: Build;
  /** When true, gear slots are clickable and open the slot editor */
  editable?: boolean;
  /** Called after a slot item is saved (parent persists the change) */
  onItemSave?: (slotId: string, item: Item) => Promise<void>;
  /** Called after a slot item is removed */
  onItemRemove?: (slotId: string) => Promise<void>;
  /**
   * Damage config to use. Defaults to baseConfig (bundled baseline).
   * Pass a server-loaded config from loadDamageConfig() to include local overrides.
   */
  config?: DamageConfig;
}

export function BuildSummaryView({
  character,
  build,
  editable = false,
  onItemSave,
  onItemRemove,
  config: configProp,
}: BuildSummaryViewProps) {
  const config = configProp ?? baseConfig;

  // Placeholder stats — scoring engine will populate these in a future commission
  const placeholderStats: Array<{ label: string; value: string }> = [
    { label: "Level", value: String(character.level) },
    { label: "Paragon", value: String(character.paragonAllocation.paragonLevel) },
  ];

  // Compute DPS at render-time (D23). Pure-functional — no I/O, no side effects.
  // Surfaces unmapped-attribute errors (D30) as a config-gap banner (not silent "—").
  const dpsState = useMemo(() => {
    const catalog = {
      skills: getSkillsForClass(character.class),
      affixes,
      aspects,
    };
    try {
      return { result: computeBuildDps(build, character, catalog, config), error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { result: null, error: message };
    }
  }, [build, character, config]);

  const { result: dpsResult, error: dpsError } = dpsState;

  // Aggregate DPS chip label (D36)
  const dpsChip =
    dpsResult && dpsResult.aggregate > 0
      ? `Sustained boss DPS: ${formatDps(dpsResult.aggregate)}`
      : null;

  return (
    <div className="flex flex-col gap-6 max-w-[1200px]">
      {/* Build header */}
      <div>
        <h1 className="text-[22px] font-bold text-stone-100 m-0 leading-[1.2]">
          {character.name}
        </h1>
        <div className="flex gap-3 items-center mt-[6px] flex-wrap">
          <span className="text-base font-semibold text-accent">
            {build.name}
          </span>
          <span className="text-stone-600">·</span>
          <span className="text-sm text-stone-400">{character.class}</span>
          <span className="text-stone-600">·</span>
          <span className="text-sm text-stone-400 tabular-nums">Level {character.level}</span>
          <span className="text-stone-600">·</span>
          <span className="text-sm text-stone-400 tabular-nums">
            Paragon {character.paragonAllocation.paragonLevel}
          </span>
          {/* D36: DPS chip replaces placeholder "Power score: —" */}
          <span className="text-stone-600">·</span>
          {dpsError ? (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <AlertTriangle size={12} />
              Config gap
            </span>
          ) : dpsChip ? (
            <span className="text-xs text-stone-300 tabular-nums font-mono">{dpsChip}</span>
          ) : (
            <span className="text-xs text-stone-600 italic">Sustained boss DPS: —</span>
          )}
        </div>
      </div>

      {/* Config gap error banner (D30) */}
      {dpsError && (
        <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded px-3 py-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>
            <span className="font-medium">Config gap:</span>{" "}
            {dpsError}
          </span>
        </div>
      )}

      {/* Main content: gear grid + stat block side by side */}
      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
          <GearSlotGrid
            items={character.equippedItems}
            characterClass={character.class}
            editable={editable}
            onItemSave={onItemSave}
            onItemRemove={onItemRemove}
          />
        </div>
        <div className="w-[260px] shrink-0">
          <div className="mini-label tracking-[0.08em] mb-2">
            Character Stats
          </div>
          <StatBlock stats={placeholderStats} />
        </div>
      </div>

      {/* D35: Full-width per-skill DPS section below gear grid + StatBlock */}
      {dpsResult && dpsResult.perSkill.length > 0 && (
        <SkillDpsSection result={dpsResult} />
      )}
    </div>
  );
}
