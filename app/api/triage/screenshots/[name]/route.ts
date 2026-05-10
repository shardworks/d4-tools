import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { getScreenshotDir, screenshotCachePath } from "@/lib/persistence/paths";
import { sha256 } from "@/lib/triage/hash";
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

/** DELETE /api/triage/screenshots/[name] — delete a screenshot and its cache entry */
export async function DELETE(_req: Request, { params }: Params) {
  const { name } = await params;

  // Reject path-traversal attempts (D16) — reject-traversal-only, not directory-listing
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
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

  const filePath = path.join(screenshotDir, name);

  // Read the file to compute the cache hash (D17).
  // If ENOENT: fileBytes = null (file not present).
  let fileBytes: Buffer | null = null;
  try {
    fileBytes = await fs.readFile(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      const message = err instanceof Error ? err.message : "Failed to read screenshot";
      return NextResponse.json({ error: message }, { status: 500 });
    }
    // ENOENT — file doesn't exist; fileBytes stays null
  }

  // Unlink the screenshot file (D18)
  let fileDeleted = false;
  try {
    await fs.unlink(filePath);
    fileDeleted = true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      const message = err instanceof Error ? err.message : "Failed to delete screenshot";
      return NextResponse.json({ error: message }, { status: 500 });
    }
    // ENOENT — already gone
  }

  // Unlink the cache JSON (D17, D18) — only possible if we could read the file
  let cacheDeleted = false;
  if (fileBytes !== null) {
    const hash = sha256(fileBytes);
    const cachePath = screenshotCachePath(hash);
    try {
      await fs.unlink(cachePath);
      cacheDeleted = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        // Non-fatal: log the partial state but don't fail the request
        console.warn(`[delete] cache unlink failed for hash=${hash.slice(0, 8)}: ${err}`);
      } else {
        console.log(`[delete] cache miss for hash=${hash.slice(0, 8)} (no cache entry to remove)`);
      }
    }
  } else if (!fileDeleted) {
    // Neither file nor cache found
    console.log(`[delete] ${name}: file not found`);
  }

  // D22: 204 if at least one existed; 404 if neither
  if (fileDeleted || cacheDeleted) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });
}
