"use client";

import type { BuildDpsResult } from "@/lib/damage";

interface SkillDpsSectionProps {
  result: BuildDpsResult;
}

/**
 * Full-width per-skill DPS breakdown section (D35).
 *
 * Displays a table of damaging skills with their individual DPS values and
 * relative share of the aggregate (max-skill) DPS value.
 * Only rendered when the build has at least one damaging skill (D28).
 */
export function SkillDpsSection({ result }: SkillDpsSectionProps) {
  const { perSkill, aggregate } = result;

  if (perSkill.length === 0) return null;

  // Sort skills by DPS descending for readability
  const sorted = [...perSkill].sort((a, b) => b.dps - a.dps);

  return (
    <div className="w-full">
      <div className="mini-label tracking-[0.08em] mb-3">Per-Skill DPS (Sustained Boss)</div>
      <div className="rounded border border-stone-800 overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-stone-800 bg-surface-2">
              <th className="text-left px-3 py-2 text-[11px] font-medium text-stone-500 uppercase tracking-wide">
                Skill
              </th>
              <th className="text-right px-3 py-2 text-[11px] font-medium text-stone-500 uppercase tracking-wide">
                DPS
              </th>
              <th className="text-right px-3 py-2 text-[11px] font-medium text-stone-500 uppercase tracking-wide">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((skill, idx) => {
              const sharePct =
                aggregate > 0 ? Math.round((skill.dps / aggregate) * 100) : 0;
              const isTop = idx === 0;
              return (
                <tr
                  key={skill.skillId}
                  className={
                    idx < sorted.length - 1 ? "border-b border-stone-800/50" : ""
                  }
                >
                  <td className="px-3 py-2 text-stone-200">
                    <span className={isTop ? "font-semibold text-accent" : ""}>
                      {skill.skillLabel}
                    </span>
                    {skill.rank > 1 && (
                      <span className="ml-1.5 text-[11px] text-stone-500">
                        r{skill.rank}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-stone-200 font-mono text-xs">
                    {formatDps(skill.dps)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-stone-400 text-xs">
                    {sharePct}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Formats a DPS value as a plain integer with thousands separators (D36). */
export function formatDps(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}
