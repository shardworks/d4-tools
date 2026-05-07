/**
 * GET /api/settings — return current settings
 * PUT /api/settings — update settings (partial merge)
 */

import { NextResponse } from "next/server";
import { loadSettings, saveSettings } from "@/lib/persistence/settings";

export async function GET() {
  try {
    const settings = await loadSettings();
    return NextResponse.json(settings);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const current = await loadSettings();
    // Merge: only accept known fields
    const updated = { ...current };
    if (body.region === "americas" || body.region === "europe" || body.region === "asia") {
      updated.region = body.region;
    }
    await saveSettings(updated);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
