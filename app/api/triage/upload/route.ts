/**
 * POST /api/triage/upload
 *
 * Accepts a multipart/form-data screenshot from the PowerShell watcher (or any client),
 * saves it atomically under SCREENSHOT_DIR, runs the vision-LLM extractor synchronously,
 * caches the result, and returns the parse outcome.
 *
 * Decisions implemented here:
 * D4  — response is a full CacheEntry in the `parsed` field
 * D5  — LLM failure → 200 with parseStatus: "error" (file still on disk)
 * D6  — auth-disabled one-shot stdout warning via module-scoped latch
 * D9  — filename collisions: suffix -1, -2, … before the extension
 * D10 — generated filename when none supplied: <ISO8601>-<first-8-of-sha256>.<ext>
 * D11 — atomic binary write: temp path → rename
 * D12 — MIME-only image validation against SUPPORTED_IMAGE_TYPES
 * D13 — always save file before checking cache; cropper runs only on cache miss
 * D15 — 201 on success
 * D17 — route response payload unchanged; crop telemetry is server-log only
 * D18 — timing-safe secret comparison via crypto.timingSafeEqual
 * D19 — filename containing / \ or .. → 400
 * D20 — single [crop] log line per request; format: [crop] hash=… detected=… …
 * D25 — cropper crops on full resolution but detects on downscaled
 */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { timingSafeEqual } from "crypto";
import { getScreenshotDir } from "@/lib/persistence/paths";
import { sha256 } from "@/lib/triage/hash";
import { getCachedParse, writeCachedParse } from "@/lib/triage/cache";
import { extractItemsFromImage } from "@/lib/triage/anthropic";
import { cropForVision } from "@/lib/triage/crop";
import { SUPPORTED_IMAGE_TYPES, type SupportedImageMediaType } from "@/lib/triage/types";

// ─── Module-scoped latch: log the auth-disabled warning at most once (D6) ──

let authWarningLogged = false;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns true if the given file path exists. */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves filename collisions: if `dir/name.png` already exists, tries
 * `dir/name-1.png`, `dir/name-2.png`, … until a free slot is found (D9).
 */
async function resolveCollision(dir: string, filename: string): Promise<string> {
  if (!(await fileExists(path.join(dir, filename)))) return filename;
  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);
  let n = 1;
  while (await fileExists(path.join(dir, `${base}-${n}${ext}`))) n++;
  return `${base}-${n}${ext}`;
}

/**
 * Atomic binary write: write to a temp path under the same directory, then
 * rename into place. Mirrors atomicWriteJson but for raw bytes (D11).
 */
async function atomicWriteBytes(finalPath: string, bytes: Buffer): Promise<void> {
  const dir = path.dirname(finalPath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${finalPath}.tmp.${process.pid}`;
  try {
    await fs.writeFile(tmp, bytes);
    await fs.rename(tmp, finalPath);
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
}

/**
 * Generates a filesystem-safe filename from an ISO-8601 timestamp and hash
 * prefix when the client does not supply a filename (D10).
 *
 * Format: <ISO8601-timestamp>-<first-8-of-sha256>.<ext>
 * Colons in the timestamp are replaced with hyphens for Windows compatibility.
 */
function generateFilename(hash: string, mediaType: string): string {
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const hashPrefix = hash.slice(0, 8);
  const ext =
    (Object.entries(SUPPORTED_IMAGE_TYPES) as [string, string][]).find(
      ([, mime]) => mime === mediaType
    )?.[0] ?? ".png";
  return `${timestamp}-${hashPrefix}${ext}`;
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  // ── Auth check (D6, D18) ──────────────────────────────────────────────────
  const uploadSecret = process.env.UPLOAD_SECRET;
  if (uploadSecret) {
    const token = request.headers.get("X-Upload-Token") ?? "";
    let authorized = false;
    try {
      const secretBuf = Buffer.from(uploadSecret, "utf-8");
      const tokenBuf = Buffer.from(token, "utf-8");
      // timingSafeEqual requires equal-length buffers; unequal length is unauthorized
      if (secretBuf.length === tokenBuf.length) {
        authorized = timingSafeEqual(secretBuf, tokenBuf);
      }
    } catch {
      authorized = false;
    }
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    // No secret set — emit a one-shot warning so operators notice (D6)
    if (!authWarningLogged) {
      authWarningLogged = true;
      console.warn(
        "[upload] UPLOAD_SECRET is not set — the upload endpoint accepts requests " +
          "without authentication. Set UPLOAD_SECRET in your environment for any " +
          "non-private-LAN deployment."
      );
    }
  }

  // ── Parse multipart form data ─────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Failed to parse multipart form data" }, { status: 400 });
  }

  // ── File field ────────────────────────────────────────────────────────────
  const fileValue = formData.get("file");
  if (!fileValue || !(fileValue instanceof Blob)) {
    return NextResponse.json({ error: "Missing required field: file" }, { status: 400 });
  }
  const file = fileValue as File;

  // ── MIME validation (D12) ─────────────────────────────────────────────────
  const supportedMimes = Object.values(SUPPORTED_IMAGE_TYPES) as string[];
  if (!supportedMimes.includes(file.type)) {
    return NextResponse.json(
      {
        error: `Unsupported media type: ${file.type || "(none)"}. Supported: ${supportedMimes.join(", ")}`,
      },
      { status: 400 }
    );
  }
  const mediaType = file.type as SupportedImageMediaType;

  // ── Filename validation (D19) ─────────────────────────────────────────────
  const rawFilename = formData.get("filename");
  let suppliedFilename: string | null = null;
  if (rawFilename !== null) {
    if (typeof rawFilename !== "string") {
      return NextResponse.json({ error: "filename field must be a string" }, { status: 400 });
    }
    // Reject any filename containing path separators or parent-dir components
    if (rawFilename.includes("/") || rawFilename.includes("\\") || rawFilename.includes("..")) {
      return NextResponse.json(
        { error: "filename contains invalid path characters (/, \\, or ..)" },
        { status: 400 }
      );
    }
    suppliedFilename = rawFilename;
  }

  // ── Read bytes and compute SHA-256 ────────────────────────────────────────
  const arrayBuffer = await file.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  const hash = sha256(bytes);

  // ── Resolve SCREENSHOT_DIR ────────────────────────────────────────────────
  let screenshotDir: string;
  try {
    screenshotDir = getScreenshotDir();
  } catch (err) {
    const message = err instanceof Error ? err.message : "SCREENSHOT_DIR is not configured";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // ── Determine final filename — generate when not supplied (D10) ───────────
  const candidateFilename = suppliedFilename ?? generateFilename(hash, mediaType);

  // ── Resolve filename collisions (D9) ──────────────────────────────────────
  const finalFilename = await resolveCollision(screenshotDir, candidateFilename);
  const finalPath = path.join(screenshotDir, finalFilename);

  // ── Atomic save — always before cache check (D11, D13) ───────────────────
  // The on-disk original is byte-identical to the upload. The cropper is
  // memory-only and never writes to this path.
  try {
    await atomicWriteBytes(finalPath, bytes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save uploaded file";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // ── Cache lookup — check after saving; hit short-circuits cropper (D5, D13) ─
  try {
    const cached = await getCachedParse(hash);
    if (cached) {
      return NextResponse.json(
        { filename: finalFilename, hash, parseStatus: cached.kind, parsed: cached },
        { status: 201 }
      );
    }
  } catch (err) {
    // Cache read failure is non-fatal — proceed to crop + LLM
    console.error("[upload] Cache read error:", err);
  }

  // ── Tooltip detection + crop (D13, D20) ──────────────────────────────────
  // Cropper runs only on cache miss. The original bytes are passed; the result
  // is memory-only (D11). A single [crop] log line per request (D20).
  const cropResult = await cropForVision(bytes, mediaType);
  console.log(
    `[crop] hash=${hash.slice(0, 8)} detected=${cropResult.detected} ` +
      `regions=${cropResult.images.length} resized=${cropResult.resized} ` +
      `bytes=${cropResult.encodedBytes}`
  );

  // ── Synchronous LLM call (D5) ─────────────────────────────────────────────
  // On failure: return 200 (not 201) to signal "file accepted but parse failed"
  let entry;
  try {
    entry = await extractItemsFromImage(cropResult.images);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Screenshot parsing failed";
    return NextResponse.json(
      { filename: finalFilename, hash, parseStatus: "error" as const, error: message },
      { status: 200 }
    );
  }

  // ── Write cache — non-fatal on failure ───────────────────────────────────
  try {
    await writeCachedParse(hash, entry);
  } catch (err) {
    console.error("[upload] Cache write error:", err);
  }

  // ── 201 success (D15) ────────────────────────────────────────────────────
  return NextResponse.json(
    { filename: finalFilename, hash, parseStatus: entry.kind, parsed: entry },
    { status: 201 }
  );
}
