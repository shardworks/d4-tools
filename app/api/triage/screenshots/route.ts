import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import { Dirent } from "fs";
import * as path from "path";
import { getScreenshotDir } from "@/lib/persistence/paths";
import { sha256 } from "@/lib/triage/hash";
import { SUPPORTED_IMAGE_TYPES } from "@/lib/triage/types";
import type { ScreenshotEntry } from "@/lib/triage/types";

const SUPPORTED_EXTS = new Set(Object.keys(SUPPORTED_IMAGE_TYPES));

/** GET /api/triage/screenshots — list screenshots sorted by mtime descending */
export async function GET() {
  let screenshotDir: string;
  try {
    screenshotDir = getScreenshotDir();
  } catch (err) {
    const message = err instanceof Error ? err.message : "SCREENSHOT_DIR is not configured";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let entries: Dirent[];
  try {
    entries = await fs.readdir(screenshotDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "SCREENSHOT_DIR does not exist: " + screenshotDir }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : "Failed to read screenshot directory";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Filter to supported image extensions (case-insensitive, D4)
  const imageFiles = entries.filter((e) => {
    if (!e.isFile()) return false;
    const ext = path.extname(e.name).toLowerCase();
    return SUPPORTED_EXTS.has(ext);
  });

  // Stat each file for mtime and compute hash
  const results: ScreenshotEntry[] = [];
  for (const file of imageFiles) {
    const filePath = path.join(screenshotDir, file.name);
    try {
      const [stat, bytes] = await Promise.all([
        fs.stat(filePath),
        fs.readFile(filePath),
      ]);
      const hash = sha256(bytes);
      results.push({
        filename: file.name,
        mtimeMs: stat.mtimeMs,
        hash,
      });
    } catch {
      // Skip files we can't read/stat
    }
  }

  // Sort by mtime descending (newest first)
  results.sort((a, b) => b.mtimeMs - a.mtimeMs);

  return NextResponse.json(results);
}
