/**
 * POST /api/triage/parse
 * Body: { filename: string }
 *
 * Flow: filename → disk path → SHA-256 → cache hit/miss → crop → LLM → cache write → result.
 * ANTHROPIC_API_KEY is only read inside extractItemsFromImage (server-side). (D24)
 *
 * Decisions implemented here:
 * D3  — path-traversal protection via directory listing
 * D5  — cropper runs only on cache miss (D13)
 * D13 — cache hit short-circuits crop + LLM; cropper is cache-miss-only
 * D17 — response payload unchanged; crop telemetry is server-log only
 * D20 — single [crop] log line per request
 */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { getScreenshotDir } from "@/lib/persistence/paths";
import { sha256 } from "@/lib/triage/hash";
import { getCachedParse, writeCachedParse } from "@/lib/triage/cache";
import { extractItemsFromImage } from "@/lib/triage/anthropic";
import { cropForVision } from "@/lib/triage/crop";
import { SUPPORTED_IMAGE_TYPES } from "@/lib/triage/types";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || typeof (body as { filename?: unknown }).filename !== "string") {
    return NextResponse.json({ error: "Missing required field: filename" }, { status: 400 });
  }

  const { filename } = body as { filename: string };

  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return NextResponse.json(
      { error: "filename contains invalid path characters (/, \\, or ..)" },
      { status: 400 }
    );
  }

  let screenshotDir: string;
  try {
    screenshotDir = getScreenshotDir();
  } catch (err) {
    const message = err instanceof Error ? err.message : "SCREENSHOT_DIR is not configured";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Path-traversal protection — validate against directory listing (D3)
  let dirContents: string[];
  try {
    const entries = await fs.readdir(screenshotDir, { withFileTypes: true });
    dirContents = entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read screenshot directory";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!dirContents.includes(filename)) {
    return NextResponse.json({ error: "Screenshot not found: " + filename }, { status: 404 });
  }

  const filePath = path.join(screenshotDir, filename);
  const ext = path.extname(filename).toLowerCase() as keyof typeof SUPPORTED_IMAGE_TYPES;
  const mediaType = SUPPORTED_IMAGE_TYPES[ext];

  if (!mediaType) {
    return NextResponse.json(
      { error: `Unsupported image format: ${ext}. Supported: jpg, jpeg, png, webp, gif` },
      { status: 400 }
    );
  }

  // Read file bytes and compute hash
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read screenshot file";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const hash = sha256(bytes);

  // Cache lookup — hit short-circuits crop + LLM (D13)
  try {
    const cached = await getCachedParse(hash);
    if (cached) {
      return NextResponse.json({ hash, cached: true, entry: cached });
    }
  } catch (err) {
    // Cache read error is non-fatal — proceed to crop + LLM
    console.error("Cache read error:", err);
  }

  // Tooltip detection + crop (D13, D20)
  // Cropper is cache-miss-only; original file on disk is not modified.
  const cropResult = await cropForVision(bytes, mediaType);
  console.log(
    `[crop] hash=${hash.slice(0, 8)} detected=${cropResult.detected} ` +
      `regions=${cropResult.images.length} resized=${cropResult.resized} ` +
      `bytes=${cropResult.encodedBytes}`
  );

  // LLM call — errors are NOT cached (D13)
  let entry;
  try {
    entry = await extractItemsFromImage(cropResult.images);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Screenshot parsing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Cache the result (only successes and no-item-detected per D13)
  try {
    await writeCachedParse(hash, entry);
  } catch (err) {
    // Cache write failure is non-fatal
    console.error("Cache write error:", err);
  }

  return NextResponse.json({ hash, cached: false, entry });
}
