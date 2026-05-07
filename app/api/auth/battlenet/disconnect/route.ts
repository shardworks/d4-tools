/**
 * POST /api/auth/battlenet/disconnect
 *
 * Deletes the stored Battle.net tokens (D25).
 * Best-effort revocation upstream is not performed (D25 decision).
 * Client should show a toast on success.
 */

import { NextResponse } from "next/server";
import { deleteTokens } from "@/lib/blizzard/tokens";

export async function POST() {
  try {
    await deleteTokens();
    return NextResponse.json({ disconnected: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to disconnect";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
