/**
 * Maxroll planner importer — public surface (D3).
 *
 * Exports ONLY `importMaxrollPlanner`. All parser/fetcher/mapper helpers are
 * private to this package (patron override, D3 decision).
 *
 * Usage:
 *   import { importMaxrollPlanner } from "lib/import/maxroll";
 *   const result = await importMaxrollPlanner("https://maxroll.gg/d4/planner/ab12cd34");
 *   if (result.ok) { ... result.variants ... }
 */

import { verifiedAgainst } from "@/lib/catalog";
import { parsePlannerRef } from "./parser";
import {
  getMaxrollPlannerApiBase,
  fetchMaxrollJson,
} from "./endpoints";
import { getDataMin } from "./data-min-cache";
import { MaxrollProfilePayloadSchema, type MaxrollVariant } from "./payload-schema";
import { assembleVariant } from "./mapper";
import type { ImportResult, ImportContext, VariantResult } from "./types";

/**
 * Import a Maxroll planner build into our canonical schema.
 *
 * @param input - A bare planner id, a planner URL (with or without variant hash),
 *   or a build-guide URL.
 * @param ctx - Optional import context for dependency injection (fetch, cacheDir, now).
 * @returns A discriminated ImportResult — ok:true with all variants, or ok:false with
 *   a structured failure reason.
 */
export async function importMaxrollPlanner(
  input: string,
  ctx: ImportContext = {}
): Promise<ImportResult> {
  const fetchFn = ctx.fetch ?? globalThis.fetch;
  const now = ctx.now ?? new Date();
  const importedAt = now.toISOString();
  const catalogPatch = verifiedAgainst.patch;

  // ── 1. Parse the input reference ──────────────────────────────────────────
  let plannerId: string;
  let defaultVariantIndex: number;
  try {
    const ref = await parsePlannerRef(input, fetchFn);
    plannerId = ref.plannerId;
    defaultVariantIndex = ref.variantIndex;
  } catch (err) {
    return {
      ok: false,
      reason: "parse-error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // ── 2. Fetch the planner profile ──────────────────────────────────────────
  let rawPayload: unknown;
  try {
    const url = `${getMaxrollPlannerApiBase()}/profiles/load?profile=${plannerId}`;
    rawPayload = await fetchMaxrollJson<unknown>(url, fetchFn);
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 404) {
      return { ok: false, reason: "not-found", message: `Planner "${plannerId}" not found (HTTP 404)` };
    }
    if (status === 403) {
      return { ok: false, reason: "private", message: `Planner "${plannerId}" is private (HTTP 403)` };
    }
    return {
      ok: false,
      reason: "network",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // ── 3. Validate the planner payload ───────────────────────────────────────
  const profileResult = MaxrollProfilePayloadSchema.safeParse(rawPayload);
  if (!profileResult.success) {
    return {
      ok: false,
      reason: "parse-error",
      message: `Planner payload validation failed: ${profileResult.error.message}`,
      details: profileResult.error,
    };
  }
  const profile = profileResult.data;
  const plannerVersion = profile.version ?? "";

  // ── 4. Fetch data.min.json ────────────────────────────────────────────────
  let dataMin: Awaited<ReturnType<typeof getDataMin>>;
  try {
    dataMin = await getDataMin(catalogPatch, {
      cacheDir: ctx.cacheDir,
      fetch: fetchFn,
    });
  } catch (err) {
    return {
      ok: false,
      reason: "network",
      message: `Failed to fetch data.min.json: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // ── 5. Extract variant array ──────────────────────────────────────────────
  //
  // Maxroll payloads use different shapes depending on planner version:
  //   - New format: { d4t: [ ...variants ] }
  //   - Alt format: { variants: [ ...variants ] }
  //   - Legacy inline: class/equipped/skills/paragon at top level

  let variants: MaxrollVariant[];
  if (profile.d4t && profile.d4t.length > 0) {
    variants = profile.d4t;
  } else if (profile.variants && profile.variants.length > 0) {
    variants = profile.variants;
  } else if (profile.class) {
    // Legacy inline single-variant
    variants = [{
      name: undefined,
      class: profile.class,
      level: profile.level,
      paragonLevel: profile.paragonLevel,
      equipped: profile.equipped,
      skills: profile.skills,
      paragon: profile.paragon,
    }];
  } else {
    return {
      ok: false,
      reason: "zero-mapped",
      message: `Planner "${plannerId}" payload contains no recognisable variants`,
    };
  }

  if (variants.length === 0) {
    return {
      ok: false,
      reason: "zero-mapped",
      message: `Planner "${plannerId}" has no variants`,
    };
  }

  // ── 6. Map all variants ───────────────────────────────────────────────────
  const variantResults: VariantResult[] = [];

  for (let i = 0; i < variants.length; i++) {
    const variantResult = assembleVariant(
      variants[i],
      i,
      dataMin,
      catalogPatch,
      plannerId,
      importedAt,
      plannerVersion
    );

    // Per-variant patch-mismatch hard failure (D9):
    // If patch differs AND explicit mapping rate < 50% → fail this variant
    const vm = variantResult.report.versionMismatch;
    if (vm && vm.explicitMappedRatio < 0.5) {
      // All variants share the same patch — if one fails the threshold, all fail
      return {
        ok: false,
        reason: "patch-mismatch",
        message:
          `Patch version mismatch: catalog is at "${vm.catalogPatch}" but planner reports ` +
          `"${vm.plannerVersion}". Only ${Math.round(vm.explicitMappedRatio * 100)}% of ` +
          `explicit affixes mapped (threshold: 50%).`,
        details: vm,
      };
    }

    variantResults.push(variantResult);
  }

  // ── 7. Zero-mapped guard ──────────────────────────────────────────────────
  const anyItemMapped = variantResults.some(
    (v) => Object.keys(v.items).length > 0
  );
  if (!anyItemMapped && variants.some((v) => Object.keys(v.equipped ?? {}).length > 0)) {
    return {
      ok: false,
      reason: "zero-mapped",
      message: `No items could be mapped from planner "${plannerId}". The data.min.json may be incompatible.`,
    };
  }

  return {
    ok: true,
    plannerId,
    variants: variantResults,
  };
}
