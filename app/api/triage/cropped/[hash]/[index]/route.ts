/**
 * GET /api/triage/cropped/[hash]/[index]?filename=...
 *
 * Returns the binary crop image at position [index] (0-based) for the screenshot
 * identified by content-hash. Re-runs cropForVision on demand (memory-only; D6).
 *
 * D5  — image sizing: natural OR fit-to-viewport (applied by the browser via CSS)
 * D7  — URL shape: /api/triage/cropped/[hash]/[index]
 * D8  — accepts ?filename= hint; rehashes the named file before serving
 * D12 — Cache-Control: public, max-age=31536000, immutable (content-hash addressed)
 * D16 — reject-traversal-only filename validation
 */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { getScreenshotDir } from "@/lib/persistence/paths";
import { sha256 } from "@/lib/triage/hash";
import { cropForVision } from "@/lib/triage/crop";
import { SUPPORTED_IMAGE_TYPES } from "@/lib/triage/types";

type Params = { params: Promise<{ hash: string; index: string }> };

export async function GET(req: Request, { params }: Params) {
  const { hash, index: indexStr } = await params;
  const index = parseInt(indexStr, 10);

  if (isNaN(index) || index < 0) {
    return NextResponse.json({ error: "Invalid crop index" }, { status: 400 });
  }

  const url = new URL(req.url);
  const filename = url.searchParams.get("filename");

  if (!filename) {
    return NextResponse.json({ error: "filename query parameter is required" }, { status: 400 });
  }

  // Reject path-traversal attempts (D16)
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

  const filePath = path.join(screenshotDir, filename);
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Failed to read screenshot";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Verify hash matches file content (D8)
  const actualHash = sha256(bytes);
  if (actualHash !== hash) {
    return NextResponse.json({ error: "Hash mismatch" }, { status: 404 });
  }

  const ext = path.extname(filename).toLowerCase() as keyof typeof SUPPORTED_IMAGE_TYPES;
  const mediaType = SUPPORTED_IMAGE_TYPES[ext];
  if (!mediaType) {
    return NextResponse.json(
      { error: `Unsupported image format: ${ext}` },
      { status: 400 }
    );
  }

  const result = await cropForVision(bytes, mediaType);

  // Telemetry — mirror the [crop] log format used by the upload and parse routes
  console.log(
    `[crop] hash=${hash.slice(0, 8)} detected=${result.detected} ` +
      `regions=${result.images.length} resized=${result.resized} ` +
      `bytes=${result.encodedBytes}`
  );

  if (index >= result.images.length) {
    return NextResponse.json({ error: "Crop index out of bounds" }, { status: 404 });
  }

  const crop = result.images[index];

  return new NextResponse(crop.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": crop.mediaType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
