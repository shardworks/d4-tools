/**
 * Source-reference parser for Maxroll planner inputs (D2/D24).
 *
 * Resolves all four input shapes to a canonical { plannerId, variantIndex }:
 *   1. Bare planner id               e.g. "ab12cd34"
 *   2. Planner URL                   e.g. "https://maxroll.gg/d4/planner/ab12cd34"
 *   3. Planner URL with hash         e.g. "https://maxroll.gg/d4/planner/ab12cd34#2&equipment"
 *   4. Build-guide URL               e.g. "https://maxroll.gg/d4/build-guides/some-slug"
 *        → fetch the page HTML and regex-match /d4/planner/<id> (take first match, D24)
 *
 * Build-guide URL resolution requires a network fetch and is async.
 */

import { fetchMaxrollText } from "./endpoints";

export interface ParsedPlannerRef {
  plannerId: string;
  /** Variant index extracted from the URL hash (e.g. "#2&equipment" → 2). Defaults to 0. */
  variantIndex: number;
}

/** Regex for a planner id: alphanumeric, 4-32 chars. */
const PLANNER_ID_RE = /^[a-zA-Z0-9]{4,32}$/;

/** Matches the planner id segment from a planner URL path. */
const PLANNER_URL_RE = /\/d4\/planner\/([a-zA-Z0-9]{4,32})/;

/** Matches the build-guide slug in a URL path. */
const BUILD_GUIDE_URL_RE = /\/d4\/build-guides\//;

/**
 * Parse a variant index from a URL hash string.
 * Accepts formats like "#2&equipment", "#2", "2&equipment", "2".
 * Returns 0 if no valid integer is found (D10).
 */
function parseVariantFromHash(hash: string): number {
  // Strip leading "#" if present
  const clean = hash.replace(/^#/, "");
  // Take the first segment before "&" or end
  const segment = clean.split("&")[0];
  const n = parseInt(segment, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Parse a Maxroll planner reference into a canonical { plannerId, variantIndex }.
 * For build-guide URLs, a network fetch is required (via `fetchFn`).
 * Throws with a descriptive message if the input cannot be resolved.
 */
export async function parsePlannerRef(
  input: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch
): Promise<ParsedPlannerRef> {
  const trimmed = input.trim();

  // ── Case 1: bare planner id ────────────────────────────────────────────────
  if (PLANNER_ID_RE.test(trimmed)) {
    return { plannerId: trimmed, variantIndex: 0 };
  }

  // ── Parse as URL for cases 2, 3, 4 ────────────────────────────────────────
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error(
      `Cannot parse planner reference "${trimmed}": not a valid URL and does not match planner-id pattern`
    );
  }

  // ── Case 4: build-guide URL — fetch HTML and extract planner id ────────────
  if (BUILD_GUIDE_URL_RE.test(parsedUrl.pathname)) {
    const html = await fetchMaxrollText(trimmed, fetchFn);
    const match = html.match(PLANNER_URL_RE);
    if (!match) {
      throw new Error(
        `Build-guide page at "${trimmed}" did not contain a /d4/planner/<id> link`
      );
    }
    return { plannerId: match[1], variantIndex: 0 };
  }

  // ── Cases 2 & 3: planner URL (with or without hash) ───────────────────────
  const pathMatch = parsedUrl.pathname.match(PLANNER_URL_RE);
  if (pathMatch) {
    const variantIndex = parsedUrl.hash ? parseVariantFromHash(parsedUrl.hash) : 0;
    return { plannerId: pathMatch[1], variantIndex };
  }

  throw new Error(
    `Cannot extract a planner id from URL "${trimmed}": expected a /d4/planner/<id> or /d4/build-guides/<slug> URL`
  );
}
