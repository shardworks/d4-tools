/**
 * Damage engine theorycraft config loader.
 *
 * Loads lib/damage/config.json as the upstream baseline, then deep-merges
 * data/damage-config.local.json over it when that file exists (D4).
 *
 * The override file is read at call time — caller determines when to invoke
 * (render-time per D23). Missing override file is legitimate state → upstream
 * defaults returned with no error.
 *
 * Deep-merge semantics:
 *  - Objects are merged recursively (nested keys can be selectively overridden)
 *  - Arrays are replaced wholesale (override replaces, not extends)
 *  - Primitive values replace the base value
 *
 * Throw behaviour: config.json load failure is fatal (misconfigured bundle);
 * override file read errors other than ENOENT are logged and ignored.
 */

import * as fs from "fs";
import * as path from "path";
import upstreamConfig from "./config.json";
import { getDataDir } from "../persistence/paths";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BucketEntry {
  bucket: string;
  conditional: "unconditional" | "cc" | "distance-close" | "distance-distant" | "vulnerable" | "elite";
  source?: string;
  notes?: string;
}

export interface BucketDefinition {
  type: "additive" | "stat" | "conditional_mult" | "distinct_mult" | "ignored";
  description: string;
}

export interface BreakpointTier {
  minMultiplier: number;
  framesPerAttack: number;
}

export interface DamageConfig {
  attributeToBucket: Record<string, BucketEntry>;
  buckets: Record<string, BucketDefinition>;
  constants: {
    csBaseline: number;
    vulnerableBaseline: number;
    critBaseChance: number;
    enemyDefenseMultiplier: number;
    [key: string]: unknown;
  };
  breakpoints: Record<string, Record<string, BreakpointTier[]>>;
  drCoefficients: Record<string, { formula: string; denominator?: number; [key: string]: unknown }>;
  uptimes: Record<string, number>;
  distanceDefault: Record<string, "close" | "distant">;
  primaryStatScalar: number;
  classPrimaryStats: Record<string, string>;
  itemPowerFormula: {
    type: "linear";
    slopePerIlvl: number;
    baseAtIlvl0: number;
    [key: string]: unknown;
  };
  weaponSlotsByClass: Record<string, string[]>;
  weaponTypeBySlot: Record<string, string>;
  baseWeaponAps: number;
  [key: string]: unknown;
}

// ─── Deep-merge ───────────────────────────────────────────────────────────────

function deepMerge<T>(base: T, override: Partial<T>): T {
  if (
    override === null ||
    typeof override !== "object" ||
    Array.isArray(override)
  ) {
    return override as T;
  }

  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };

  for (const key of Object.keys(override) as string[]) {
    const overrideVal = (override as Record<string, unknown>)[key];
    const baseVal = (base as Record<string, unknown>)[key];

    if (
      overrideVal !== null &&
      typeof overrideVal === "object" &&
      !Array.isArray(overrideVal) &&
      baseVal !== null &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal, overrideVal as Partial<typeof baseVal>);
    } else {
      // Arrays, primitives, null: replace wholesale
      result[key] = overrideVal;
    }
  }

  return result as T;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Returns the resolved damage engine config.
 *
 * Upstream baseline is lib/damage/config.json (bundled).
 * Optional override: data/damage-config.local.json (at DATA_DIR).
 * Deep-merged at call time.
 *
 * @param overridePathOverride — explicit override file path (for testing only).
 *   When omitted, the path is resolved from DATA_DIR via getDataDir().
 */
export function loadDamageConfig(overridePathOverride?: string): DamageConfig {
  const base = upstreamConfig as unknown as DamageConfig;

  let overridePath: string;
  if (overridePathOverride !== undefined) {
    overridePath = overridePathOverride;
  } else {
    try {
      overridePath = path.join(getDataDir(), "damage-config.local.json");
    } catch {
      // getDataDir() throws in production if DATA_DIR is unset — no override available
      return base;
    }
  }

  if (!fs.existsSync(overridePath)) {
    return base;
  }

  try {
    const raw = fs.readFileSync(overridePath, "utf8");
    const override = JSON.parse(raw) as Partial<DamageConfig>;
    return deepMerge(base, override);
  } catch (err) {
    // Parse errors / permission errors: log and fall back to upstream
    console.warn(
      `[damage/config] Failed to load override file ${overridePath}: ${err}. Using upstream defaults.`
    );
    return base;
  }
}
