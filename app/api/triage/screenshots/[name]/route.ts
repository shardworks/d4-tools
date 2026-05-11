import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { getScreenshotDir, screenshotCachePath } from "@/lib/persistence/paths";
import { sha256 } from "@/lib/triage/hash";
import { getCachedHash, forget } from "@/lib/triage/hash-cache";
import { SUPPORTED_IMAGE_TYPES } from "@/lib/triage/types";

type Params = { params: Promise<{ name: string }> };

/** GET /api/triage/screenshots/[name] — stream a screenshot file */
export async function GET(_req: Request, { params }: Params) {
  const { name } = await params;

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
export async function DELETE(req: Request, { params }: Params) {
  const { name } = await params;

  // Reject path-traversal attempts (D16)
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    return NextResponse.json(
      { error: "filename contains invalid path characters (/, \\, or ..)" },
      { status: 400 }
    );
  }

  // Optional hash query param: allows deletion of cache-only orphans (no file on disk).
  // When the file is missing, the handler cannot compute the hash from file content;
  // a client that knows the hash (from a prior upload/parse response) can supply it.
  const url = new URL(req.url);
  const queryHash = url.searchParams.get("hash");
  const HASH_RE = /^[a-f0-9]{64}$/;
  const validQueryHash = queryHash && HASH_RE.test(queryHash) ? queryHash : null;

  let screenshotDir: string;
  try {
    screenshotDir = getScreenshotDir();
  } catch (err) {
    const message = err instanceof Error ? err.message : "SCREENSHOT_DIR is not configured";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const filePath = path.join(screenshotDir, name);

  // Stat the file to obtain (mtimeMs, size) for the hash cache lookup (D6).
  // ENOENT → the file is already gone; other errors are surfaced as 500.
  let fileStat: { mtimeMs: number; size: number } | null = null;
  try {
    const s = await fs.stat(filePath);
    fileStat = { mtimeMs: s.mtimeMs, size: s.size };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      const message = err instanceof Error ? err.message : "Failed to read screenshot";
      return NextResponse.json({ error: message }, { status: 500 });
    }
    // ENOENT — file doesn't exist; fileStat stays null
  }

  // Resolve the hash via the cache (D6, D7).
  // On a cache hit the file bytes are NOT read; on a miss the compute thunk
  // calls fs.readFile + sha256 and populates the cache.
  let fileHash: string | null = null;
  if (fileStat !== null) {
    try {
      fileHash = await getCachedHash(
        name,
        fileStat.mtimeMs,
        fileStat.size,
        async () => {
          const bytes = await fs.readFile(filePath);
          return sha256(bytes);
        },
      );
    } catch {
      // Failed to read bytes (e.g. race-condition ENOENT); fileHash stays null.
      // We still proceed to attempt the unlink below.
    }
  }

  // Unlink the screenshot file (D18)
  let fileDeleted = false;
  try {
    await fs.unlink(filePath);
    fileDeleted = true;
    forget(name); // Evict the hash cache entry after successful deletion (D4)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      const message = err instanceof Error ? err.message : "Failed to delete screenshot";
      return NextResponse.json({ error: message }, { status: 500 });
    }
    // ENOENT — already gone
  }

  // Unlink the cache JSON (D17, D18).
  // Use file content hash if available; fall back to the query-param hash for orphans.
  let cacheDeleted = false;
  const hashForCache = fileHash ?? validQueryHash;
  if (hashForCache !== null) {
    const cachePath = screenshotCachePath(hashForCache);
    try {
      await fs.unlink(cachePath);
      cacheDeleted = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`[delete] cache unlink failed for hash=${hashForCache.slice(0, 8)}: ${err}`);
      } else {
        console.log(`[delete] cache miss for hash=${hashForCache.slice(0, 8)} (no cache entry to remove)`);
      }
    }
  } else if (!fileDeleted) {
    console.log(`[delete] ${name}: file not found`);
  }

  // D22: 204 if at least one existed; 404 if neither
  if (fileDeleted || cacheDeleted) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });
}
