import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { getScreenshotDir } from "@/lib/persistence/paths";
import { SUPPORTED_IMAGE_TYPES } from "@/lib/triage/types";

type Params = { params: Promise<{ name: string }> };

/** GET /api/triage/screenshots/[name] — stream a screenshot file */
export async function GET(_req: Request, { params }: Params) {
  const { name } = await params;

  let screenshotDir: string;
  try {
    screenshotDir = getScreenshotDir();
  } catch (err) {
    const message = err instanceof Error ? err.message : "SCREENSHOT_DIR is not configured";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Path-traversal protection: validate filename against the actual directory listing (D3).
  // Do NOT use isSafeId — image filenames have dots and mixed case.
  let dirContents: string[];
  try {
    const entries = await fs.readdir(screenshotDir, { withFileTypes: true });
    dirContents = entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read screenshot directory";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!dirContents.includes(name)) {
    return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });
  }

  const filePath = path.join(screenshotDir, name);
  const ext = path.extname(name).toLowerCase() as keyof typeof SUPPORTED_IMAGE_TYPES;
  const contentType = SUPPORTED_IMAGE_TYPES[ext] ?? "application/octet-stream";

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read screenshot";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
