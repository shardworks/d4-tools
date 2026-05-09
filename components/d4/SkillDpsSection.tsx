"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { BuildDpsResult, SkillDpsResult } from "@/lib/damage";

interface SkillDpsSectionProps {
  result: BuildDpsResult;
}

/**
 * Full-width per-skill DPS breakdown section (D35).
 *
 * Displays a table of damaging skills with their individual DPS values and
 * relative share of the aggregate (max-skill) DPS value.
 * Each row is expandable to show the per-bucket multiplicative contributions
 * and any conditionals applied (D20, D38).
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
              <th className="w-6 px-1 py-2" aria-label="Expand" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((skill, idx) => {
              const sharePct =
                aggregate > 0 ? Math.round((skill.dps / aggregate) * 100) : 0;
              const isTop = idx === 0;
              return (
                <SkillRow
                  key={skill.skillId}
                  skill={skill}
                  sharePct={sharePct}
                  isTop={isTop}
                  isLast={idx === sorted.length - 1}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface SkillRowProps {
  skill: SkillDpsResult;
  sharePct: number;
  isTop: boolean;
  isLast: boolean;
}

/**
 * Per-skill table row with expandable bucket breakdown (D20) and conditionals (D38).
 */
function SkillRow({ skill, sharePct, isTop, isLast }: SkillRowProps) {
  const [expanded, setExpanded] = useState(false);

  const hasBreakdown =
    Object.keys(skill.bucketContributions).length > 0 ||
    skill.conditionalsApplied.length > 0;

  return (
    <>
      <tr
        className={[
          !isLast || expanded ? "border-b border-stone-800/50" : "",
          hasBreakdown ? "cursor-pointer hover:bg-surface-2/40" : "",
        ].join(" ")}
        onClick={() => hasBreakdown && setExpanded((e) => !e)}
        role={hasBreakdown ? "button" : undefined}
        aria-expanded={hasBreakdown ? expanded : undefined}
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
        <td className="px-1 py-2 text-center">
          {hasBreakdown ? (
            expanded ? (
              <ChevronDown size={13} className="text-stone-500 mx-auto" />
            ) : (
              <ChevronRight size={13} className="text-stone-500 mx-auto" />
            )
          ) : null}
        </td>
      </tr>

      {/* Expandable breakdown (D20, D38) */}
      {expanded && hasBreakdown && (
        <tr className={!isLast ? "border-b border-stone-800/50" : ""}>
          <td colSpan={4} className="px-4 pb-3 pt-1 bg-surface-2/20">
            <BucketBreakdown skill={skill} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Renders the per-bucket multiplicative breakdown and conditionals for a skill (D20, D38).
 */
function BucketBreakdown({ skill }: { skill: SkillDpsResult }) {
  const BUCKET_LABELS: Record<string, string> = {
    additive: "Additive",
    crit: "Critical Strike EV",
    vulnerable: "Vulnerable EV",
    distinct: "Distinct Mult (×)",
    enemyDefense: "Enemy Defense",
  };

  const bucketEntries = Object.entries(skill.bucketContributions).filter(
    ([, v]) => v !== 1.0 // only show non-trivial buckets
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Bucket multipliers */}
      {bucketEntries.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-stone-500 uppercase tracking-wide mb-1">
            Bucket multipliers
          </div>
          <div className="flex flex-col gap-0.5">
            {bucketEntries.map(([bucket, multiplier]) => (
              <div key={bucket} className="flex justify-between text-[11px]">
                <span className="text-stone-400">
                  {BUCKET_LABELS[bucket] ?? bucket}
                </span>
                <span className="tabular-nums font-mono text-stone-300">
                  ×{multiplier.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conditionals applied (D38) */}
      {skill.conditionalsApplied.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-stone-500 uppercase tracking-wide mb-1">
            Conditionals (boss-DPS framing)
          </div>
          <div className="flex flex-col gap-0.5">
            {skill.conditionalsApplied.map((c, i) => (
              <div key={i} className="flex justify-between text-[11px]">
                <span className="text-stone-400 capitalize">
                  {c.type.replace("-", " ")}
                </span>
                <span className="tabular-nums font-mono text-stone-300">
                  {Math.round(c.uptime * 100)}% uptime ·{" "}
                  {Math.round(c.contributionPct * 100)}% of additive
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Formats a DPS value as a plain integer with thousands separators (D36). */
export function formatDps(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}
