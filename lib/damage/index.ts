/**
 * Damage engine public API.
 *
 * Single entry point: computeBuildDps(build, character, catalog, config)
 * Returns { perSkill: SkillDpsResult[], aggregate: number } (D2).
 *
 * The engine is pure-functional: no I/O, no caching, no global state (D23).
 * Callers invoke it at render-time; reactivity flows through the normal
 * React data-flow pattern.
 *
 * v1 exclusions (documented in lib/damage/README.md):
 *   - Overpower (D24): OP = 0
 *   - Paragon/glyph contributions (D25): paragonAllocation ignored
 *   - Movement speed (D31): no MS threshold modeling
 *   - Resource economy (D27): optimistic sustain assumed
 *   - AoE / multi-target / non-boss content: out of scope
 */

import type { Character, Build } from "../schema";
import type { SkillEntry, AffixEntry, AspectEntry } from "../catalog";
import type { DamageConfig } from "./config";
import { computeBuildDpsFromParts, isSkillDamaging } from "./formula";

export type { BuildDpsResult, SkillDpsResult, ConditionalApplied, AffixContribution } from "./types";
// Note: loadDamageConfig is server-only (uses fs). Import it directly from
// "@/lib/damage/config" in server components / route handlers.
// Client components use `baseConfig` from "@/lib/damage/client-config".
export type { DamageConfig } from "./config";

// ─── Catalog shape (minimal subset used by the engine) ───────────────────────

export interface EngineCatalog {
  /** Skills for the character's class */
  skills: SkillEntry[];
  /** All affix entries (for attribute routing) */
  affixes: AffixEntry[];
  /** All aspect entries (for attribute routing + distinct-multiplier flag) */
  aspects: AspectEntry[];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Computes sustained boss DPS for all damaging skills in a build.
 *
 * @param build     - Build record (used to identify the character and name)
 * @param character - Character with equipped items and skill selections
 * @param catalog   - Catalog subset (skills, affixes, aspects for this class)
 * @param config    - Resolved damage config (from loadDamageConfig())
 * @returns         - { perSkill: SkillDpsResult[], aggregate: number }
 * @throws          - When an equipped affix references an unmapped attribute (D30)
 */
export function computeBuildDps(
  _build: Build,
  character: Character,
  catalog: EngineCatalog,
  config: DamageConfig
): ReturnType<typeof computeBuildDpsFromParts> {
  // Build skillId → rank map from character.skillSelections
  const skillRankMap = new Map<string, number>();
  for (const sel of character.skillSelections) {
    skillRankMap.set(sel.skillId, sel.rank);
  }

  return computeBuildDpsFromParts(
    catalog.skills,
    skillRankMap,
    character.class,
    character.equippedItems,
    catalog.affixes,
    catalog.aspects,
    config
  );
}

/**
 * Convenience export: check if a skill is damaging (has damage-bucket scaling).
 * Used by UI components to filter the skill list for display.
 */
export { isSkillDamaging };
