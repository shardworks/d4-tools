/**
 * POST /api/import/maxroll/preview
 *
 * Stateless preview route (D23). Accepts a planner reference, invokes the
 * library, and returns ALL variants' mapped data in one response. No server-side
 * preview state — the UI holds state and commits via the existing
 * POST /api/characters?withDefaultBuild=true endpoint.
 *
 * Request body (JSON):
 *   { input: string }  — bare planner id, planner URL, or build-guide URL
 *
 * Success response (200):
 *   { plannerId: string, variants: VariantResult[] }
 *
 * Failure HTTP status mapping (D5 / brief §T5):
 *   400 — parse-error
 *   404 — not-found | private
 *   409 — patch-mismatch
 *   422 — zero-mapped
 *   502 — network
 */

import { NextResponse } from "next/server";
import { importMaxrollPlanner } from "@/lib/import/maxroll";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || !("input" in body)) {
    return NextResponse.json(
      { error: 'Request body must be JSON with an "input" field' },
      { status: 400 }
    );
  }

  const { input } = body as { input: unknown };
  if (typeof input !== "string" || input.trim().length === 0) {
    return NextResponse.json(
      { error: '"input" must be a non-empty string (planner id or URL)' },
      { status: 400 }
    );
  }

  const result = await importMaxrollPlanner(input.trim());

  if (result.ok) {
    return NextResponse.json(
      { plannerId: result.plannerId, variants: result.variants },
      { status: 200 }
    );
  }

  // Map library failure reason → HTTP status
  const statusByReason: Record<string, number> = {
    "not-found": 404,
    "private":   404,
    "patch-mismatch": 409,
    "zero-mapped":    422,
    "network":        502,
    "parse-error":    400,
  };
  const status = statusByReason[result.reason] ?? 400;

  return NextResponse.json(
    { error: result.message, reason: result.reason, details: result.details ?? null },
    { status }
  );
}
