/**
 * Public entry point for the formula evaluation module.
 *
 * Exposes:
 *  - `loadFormulas(datamineRoot)` — reads `AttributeFormulas.gam.json` and returns
 *    a Map<formulaName, FormulaRecord> for O(1) lookup by affix transformer.
 *  - `evaluateFormulaBands(record, scalars, isPercent)` — evaluates all IP bands in a
 *    formula record, applying D2 (union at band floor/ceiling) and D3 (formula-native bands).
 *  - Re-exports `evaluate`, `UnsupportedFunctionError`, `FormulaParseError`, and type exports.
 *
 * Per D4: evaluator lives only here in `tools/datamine-import/formulas/`; the runtime
 * catalog ships pre-evaluated bands. Per D24: the structured formula table is in-memory only.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { evaluate, UnsupportedFunctionError, type EvalContext } from "./evaluator";
import type { AffixScalars } from "./constants";

// Re-export for convenience
export { evaluate, UnsupportedFunctionError } from "./evaluator";
export { FormulaParseError } from "./evaluator";
export { loadGlobalConstants } from "./constants";
export type { AffixScalars, IpThresholds, GlobalConstants } from "./constants";
export type { EvalContext } from "./evaluator";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A per-IP-band entry in the formula table.
 * `nMinItemPower` is the inclusive lower bound of the IP range for this formula.
 */
export interface FormulaScaling {
  nMinItemPower: number;
  szFormula: string;
}

/** A single formula record from `AttributeFormulas.gam.json`. */
export interface FormulaRecord {
  name: string;
  arAffixScalings: FormulaScaling[];
}

/**
 * A per-IP-tier band in `AffixEntry.valueRanges`.
 * Sorted ascending by `minItemPower`. Non-empty guaranteed by the serializer (D19).
 */
export interface ValueRangeBand {
  /** Inclusive lower bound of the IP range for this band. */
  minItemPower: number;
  /** Minimum achievable value within the band (position=min at band floor IP). */
  min: number;
  /** Maximum achievable value within the band (position=max at band ceiling IP). */
  max: number;
}

// ─── Formula table loader ────────────────────────────────────────────────────

/**
 * Reads `AttributeFormulas.gam.json` from the datamine root.
 * Path: `json/base/meta/GameBalance/AttributeFormulas.gam.json`
 *
 * Returns a Map<formulaName → FormulaRecord> for O(1) lookup.
 * Returns an empty map if the file does not exist (graceful degradation for test fixtures
 * that have not been populated yet).
 */
export function loadFormulas(datamineRoot: string): Map<string, FormulaRecord> {
  const formulasPath = path.join(
    datamineRoot,
    "json",
    "base",
    "meta",
    "GameBalance",
    "AttributeFormulas.gam.json"
  );

  if (!fs.existsSync(formulasPath)) {
    return new Map();
  }

  const raw = fs.readFileSync(formulasPath, "utf8");
  const data = JSON.parse(raw) as Record<string, unknown>;

  // The file shape is one of:
  //
  //   1. Real d4data (DiabloTools/d4data, current at patch 3.0.1.71747+):
  //      { ptData: [ { tEntries: [ { tHeader: { szName }, arRanges: [
  //          { nItemPowerRangeStart, tFormula: { value } }, ... ] } ] } ] }
  //
  //   2. Legacy / test-fixture shape:
  //      { arFormulas: [ { name, arAffixScalings: [
  //          { nMinItemPower, szFormula }, ... ] } ] }
  //
  //   3. Plain array of legacy records (no wrapper).
  //
  // The real-d4data shape is the one the import must support to function in
  // production. The legacy shape is kept so existing fixture tests do not have
  // to migrate in the same change. Each shape normalizes to a FormulaRecord.
  const map = new Map<string, FormulaRecord>();

  // ── Shape 1: real d4data (ptData → tEntries → arRanges) ────────────────────
  if (Array.isArray(data["ptData"])) {
    for (const block of data["ptData"] as unknown[]) {
      const blockRec = block as Record<string, unknown>;
      const tEntries = blockRec["tEntries"];
      if (!Array.isArray(tEntries)) continue;

      for (const entry of tEntries) {
        const entryRec = entry as Record<string, unknown>;
        const header = entryRec["tHeader"] as Record<string, unknown> | undefined;
        const name = typeof header?.["szName"] === "string" ? (header["szName"] as string) : undefined;
        if (!name) continue;

        const arRanges = entryRec["arRanges"];
        if (!Array.isArray(arRanges)) continue;

        const arAffixScalings: FormulaScaling[] = arRanges
          .map((r) => {
            const rr = r as Record<string, unknown>;
            const nMin = typeof rr["nItemPowerRangeStart"] === "number"
              ? (rr["nItemPowerRangeStart"] as number)
              : 0;
            const tFormula = rr["tFormula"] as Record<string, unknown> | undefined;
            const szF = typeof tFormula?.["value"] === "string" ? (tFormula["value"] as string) : "0";
            return { nMinItemPower: nMin, szFormula: szF };
          })
          .filter((s) => s.szFormula !== "0" && s.szFormula !== "")
          .sort((a, b) => a.nMinItemPower - b.nMinItemPower);

        if (arAffixScalings.length > 0) {
          map.set(name, { name, arAffixScalings });
        }
      }
    }

    return map;
  }

  // ── Shape 2/3: legacy arFormulas (plain or wrapped) ────────────────────────
  let formulaList: unknown[];
  if (Array.isArray(data)) {
    formulaList = data;
  } else if (Array.isArray(data["arFormulas"])) {
    formulaList = data["arFormulas"] as unknown[];
  } else {
    return new Map();
  }

  for (const item of formulaList) {
    const rec = item as Record<string, unknown>;
    const name = typeof rec["name"] === "string" ? rec["name"] : undefined;
    if (!name) continue;

    const rawScalings = rec["arAffixScalings"];
    if (!Array.isArray(rawScalings)) continue;

    const arAffixScalings: FormulaScaling[] = rawScalings
      .map((s) => {
        const sr = s as Record<string, unknown>;
        const nMin = typeof sr["nMinItemPower"] === "number" ? sr["nMinItemPower"] : 0;
        const szF = typeof sr["szFormula"] === "string" ? sr["szFormula"] : "0";
        return { nMinItemPower: nMin, szFormula: szF };
      })
      .sort((a, b) => a.nMinItemPower - b.nMinItemPower); // ensure ascending

    if (arAffixScalings.length > 0) {
      map.set(name, { name, arAffixScalings });
    }
  }

  return map;
}

// ─── Band evaluator ───────────────────────────────────────────────────────────

/** Maximum IP used as the ceiling for the last band (D14 — from game-math.json; 1000 in D4). */
const MAX_ITEM_POWER = 1000;

/**
 * Evaluates all IP bands in a formula record, returning a non-empty `ValueRangeBand[]`.
 *
 * Per D2: for each band, min = evaluate(formula, floorIP, position="min") and
 *         max = evaluate(formula, ceilingIP, position="max") where ceilingIP is the next
 *         band's floor - 1 (or MAX_ITEM_POWER for the last band).
 * Per D3: bands are the formula's own native cuts (nMinItemPower entries).
 * Per D19: asserts the result is non-empty.
 *
 * When `isPercent` is true, multiplies both min and max by 100 so the catalog stores
 * player-visible percentages (e.g. 8.0 rather than 0.08 for "8% Maximum Life").
 *
 * Throws `UnsupportedFunctionError` if the formula uses a disallowed DSL function (D5).
 */
export function evaluateFormulaBands(
  record: FormulaRecord,
  scalars: AffixScalars,
  isPercent: boolean
): ValueRangeBand[] {
  const bands: ValueRangeBand[] = [];
  const scalings = record.arAffixScalings;

  for (let i = 0; i < scalings.length; i++) {
    const scaling = scalings[i];
    const floorIP = scaling.nMinItemPower;
    const ceilingIP = i + 1 < scalings.length
      ? scalings[i + 1].nMinItemPower - 1
      : MAX_ITEM_POWER;

    const minCtx: EvalContext = { itemPower: floorIP,   position: "min", scalars };
    const maxCtx: EvalContext = { itemPower: ceilingIP, position: "max", scalars };

    let rawMin = evaluate(scaling.szFormula, minCtx);
    let rawMax = evaluate(scaling.szFormula, maxCtx);

    if (isPercent) {
      rawMin = rawMin * 100;
      rawMax = rawMax * 100;
    }

    // Round to avoid floating-point drift (keep up to 3 decimal places)
    const min = Math.round(rawMin * 1000) / 1000;
    const max = Math.round(rawMax * 1000) / 1000;

    bands.push({ minItemPower: floorIP, min, max });
  }

  if (bands.length === 0) {
    throw new Error(`Formula '${record.name}' produced zero bands — this is a bug.`);
  }

  return bands;
}

/**
 * Returns the `ValueRangeBand` from a non-empty band array that applies at `itemPower`.
 *
 * Scans ascending by `minItemPower` and returns the band with the highest
 * `minItemPower ≤ itemPower`. Falls back to the last (highest-tier) band when
 * `itemPower` is undefined (D8 — max-tier fallback for IP-less lookups).
 */
export function getBandAtItemPower(
  bands: ValueRangeBand[],
  itemPower: number | undefined
): ValueRangeBand {
  if (itemPower === undefined) {
    return bands[bands.length - 1];
  }

  // Scan in reverse: first band whose minItemPower ≤ itemPower
  for (let i = bands.length - 1; i >= 0; i--) {
    if (bands[i].minItemPower <= itemPower) {
      return bands[i];
    }
  }

  // itemPower is below all band floors — return the lowest band
  return bands[0];
}
