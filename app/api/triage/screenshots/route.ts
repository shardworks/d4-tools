import { NextResponse } from "next/server";
import { getScreenshotDir } from "@/lib/persistence/paths";
import { scanScreenshotDir } from "@/lib/triage/scan";
import type { ScreenshotEntry } from "@/lib/triage/types";

/** GET /api/triage/screenshots — list screenshots sorted by mtime descending */
export async function GET() {
  let screenshotDir: string;
  try {
    screenshotDir = getScreenshotDir();
  } catch (err) {
    const message = err instanceof Error ? err.message : "SCREENSHOT_DIR is not configured";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let results: ScreenshotEntry[];
  try {
    results = await scanScreenshotDir(screenshotDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "SCREENSHOT_DIR does not exist: " + screenshotDir }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : "Failed to read screenshot directory";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(results);
}
