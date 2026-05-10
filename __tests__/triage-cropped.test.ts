/**
 * Tests for GET /api/triage/cropped/[hash] (metadata) and
 * GET /api/triage/cropped/[hash]/[index] (binary image).
 *
 * Follows the same pattern as triage-upload.test.ts:
 * - per-test mkdtemp for DATA_DIR and SCREENSHOT_DIR
 * - dynamic imports after env-var setup
 * - vi.mock("@/lib/triage/crop") at the module boundary
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { sha256 } from "../lib/triage/hash";

vi.mock("@/lib/triage/crop");

const FAKE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);

function defaultCropResult(bytes: Buffer = FAKE_PNG) {
  return {
    images: [{ bytes, mediaType: "image/png" as const }],
    detected: true,
    resized: false,
    encodedBytes: Math.ceil(bytes.length / 3) * 4,
  };
}

describe("GET /api/triage/cropped/[hash] (metadata endpoint)", () => {
  let tmpDir: string;
  let screenshotDir: string;
  const origDataDir = process.env.DATA_DIR;
  const origScreenshotDir = process.env.SCREENSHOT_DIR;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "d4-cropped-meta-test-"));
    screenshotDir = path.join(tmpDir, "screenshots");
    await fs.mkdir(screenshotDir, { recursive: true });
    process.env.DATA_DIR = tmpDir;
    process.env.SCREENSHOT_DIR = screenshotDir;
  });

  afterEach(async () => {
    process.env.DATA_DIR = origDataDir;
    process.env.SCREENSHOT_DIR = origScreenshotDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns { count, detected } for a known hash with single crop", async () => {
    await fs.writeFile(path.join(screenshotDir, "test.png"), FAKE_PNG);
    const hash = sha256(FAKE_PNG);

    const { cropForVision } = await import("@/lib/triage/crop");
    (cropForVision as ReturnType<typeof vi.fn>).mockResolvedValue(defaultCropResult());

    const { GET } = await import("../app/api/triage/cropped/[hash]/route");
    const req = new Request(`http://localhost/api/triage/cropped/${hash}?filename=test.png`);
    const res = await GET(req, { params: Promise.resolve({ hash }) });

    expect(res.status).toBe(200);
    const body = await res.json() as { count: number; detected: boolean };
    expect(body.count).toBe(1);
    expect(body.detected).toBe(true);
  });

  it("returns { count, detected } for multi-crop result", async () => {
    await fs.writeFile(path.join(screenshotDir, "multi.png"), FAKE_PNG);
    const hash = sha256(FAKE_PNG);

    const crop1 = Buffer.from([0x01]);
    const crop2 = Buffer.from([0x02]);
    const { cropForVision } = await import("@/lib/triage/crop");
    (cropForVision as ReturnType<typeof vi.fn>).mockResolvedValue({
      images: [
        { bytes: crop1, mediaType: "image/png" as const },
        { bytes: crop2, mediaType: "image/png" as const },
      ],
      detected: true,
      resized: false,
      encodedBytes: 8,
    });

    const { GET } = await import("../app/api/triage/cropped/[hash]/route");
    const req = new Request(`http://localhost/api/triage/cropped/${hash}?filename=multi.png`);
    const res = await GET(req, { params: Promise.resolve({ hash }) });

    expect(res.status).toBe(200);
    const body = await res.json() as { count: number; detected: boolean };
    expect(body.count).toBe(2);
    expect(body.detected).toBe(true);
  });

  it("returns detected=false when no tooltip was found", async () => {
    await fs.writeFile(path.join(screenshotDir, "notip.png"), FAKE_PNG);
    const hash = sha256(FAKE_PNG);

    const { cropForVision } = await import("@/lib/triage/crop");
    (cropForVision as ReturnType<typeof vi.fn>).mockResolvedValue({
      images: [{ bytes: FAKE_PNG, mediaType: "image/png" as const }],
      detected: false,
      resized: false,
      encodedBytes: Math.ceil(FAKE_PNG.length / 3) * 4,
    });

    const { GET } = await import("../app/api/triage/cropped/[hash]/route");
    const req = new Request(`http://localhost/api/triage/cropped/${hash}?filename=notip.png`);
    const res = await GET(req, { params: Promise.resolve({ hash }) });

    expect(res.status).toBe(200);
    const body = await res.json() as { count: number; detected: boolean };
    expect(body.count).toBe(1);
    expect(body.detected).toBe(false);
  });

  it("returns 400 when filename is missing", async () => {
    const hash = sha256(FAKE_PNG);
    const { GET } = await import("../app/api/triage/cropped/[hash]/route");
    const req = new Request(`http://localhost/api/triage/cropped/${hash}`);
    const res = await GET(req, { params: Promise.resolve({ hash }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for filename with path-traversal characters (..)", async () => {
    const hash = sha256(FAKE_PNG);
    const { GET } = await import("../app/api/triage/cropped/[hash]/route");
    const req = new Request(`http://localhost/api/triage/cropped/${hash}?filename=../etc/passwd`);
    const res = await GET(req, { params: Promise.resolve({ hash }) });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid path/i);
  });

  it("returns 400 for filename with forward slash", async () => {
    const hash = sha256(FAKE_PNG);
    const { GET } = await import("../app/api/triage/cropped/[hash]/route");
    const req = new Request(`http://localhost/api/triage/cropped/${hash}?filename=subdir/file.png`);
    const res = await GET(req, { params: Promise.resolve({ hash }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the source file does not exist", async () => {
    const hash = sha256(FAKE_PNG);
    const { GET } = await import("../app/api/triage/cropped/[hash]/route");
    const req = new Request(`http://localhost/api/triage/cropped/${hash}?filename=missing.png`);
    const res = await GET(req, { params: Promise.resolve({ hash }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when hash does not match file content", async () => {
    await fs.writeFile(path.join(screenshotDir, "test.png"), FAKE_PNG);
    const wrongHash = "a".repeat(64);

    const { GET } = await import("../app/api/triage/cropped/[hash]/route");
    const req = new Request(`http://localhost/api/triage/cropped/${wrongHash}?filename=test.png`);
    const res = await GET(req, { params: Promise.resolve({ hash: wrongHash }) });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/triage/cropped/[hash]/[index] (binary endpoint)", () => {
  let tmpDir: string;
  let screenshotDir: string;
  const origDataDir = process.env.DATA_DIR;
  const origScreenshotDir = process.env.SCREENSHOT_DIR;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "d4-cropped-bin-test-"));
    screenshotDir = path.join(tmpDir, "screenshots");
    await fs.mkdir(screenshotDir, { recursive: true });
    process.env.DATA_DIR = tmpDir;
    process.env.SCREENSHOT_DIR = screenshotDir;
  });

  afterEach(async () => {
    process.env.DATA_DIR = origDataDir;
    process.env.SCREENSHOT_DIR = origScreenshotDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns image bytes with correct Content-Type and Cache-Control", async () => {
    const cropBytes = Buffer.from([0xAB, 0xCD, 0xEF]);
    await fs.writeFile(path.join(screenshotDir, "shot.png"), FAKE_PNG);
    const hash = sha256(FAKE_PNG);

    const { cropForVision } = await import("@/lib/triage/crop");
    (cropForVision as ReturnType<typeof vi.fn>).mockResolvedValue({
      images: [{ bytes: cropBytes, mediaType: "image/jpeg" as const }],
      detected: true,
      resized: true,
      encodedBytes: Math.ceil(cropBytes.length / 3) * 4,
    });

    const { GET } = await import("../app/api/triage/cropped/[hash]/[index]/route");
    const req = new Request(`http://localhost/api/triage/cropped/${hash}/0?filename=shot.png`);
    const res = await GET(req, { params: Promise.resolve({ hash, index: "0" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");

    const responseBytes = Buffer.from(await res.arrayBuffer());
    expect(Buffer.compare(responseBytes, cropBytes)).toBe(0);
  });

  it("returns 404 for out-of-bounds index", async () => {
    await fs.writeFile(path.join(screenshotDir, "shot.png"), FAKE_PNG);
    const hash = sha256(FAKE_PNG);

    const { cropForVision } = await import("@/lib/triage/crop");
    (cropForVision as ReturnType<typeof vi.fn>).mockResolvedValue(defaultCropResult());

    const { GET } = await import("../app/api/triage/cropped/[hash]/[index]/route");
    const req = new Request(`http://localhost/api/triage/cropped/${hash}/5?filename=shot.png`);
    const res = await GET(req, { params: Promise.resolve({ hash, index: "5" }) });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/out of bounds/i);
  });

  it("returns 404 when source file does not exist", async () => {
    const hash = sha256(FAKE_PNG);
    const { GET } = await import("../app/api/triage/cropped/[hash]/[index]/route");
    const req = new Request(`http://localhost/api/triage/cropped/${hash}/0?filename=missing.png`);
    const res = await GET(req, { params: Promise.resolve({ hash, index: "0" }) });
    expect(res.status).toBe(404);
  });

  it("returns 400 for path-traversal filename", async () => {
    const hash = sha256(FAKE_PNG);
    const { GET } = await import("../app/api/triage/cropped/[hash]/[index]/route");
    const req = new Request(`http://localhost/api/triage/cropped/${hash}/0?filename=../etc/passwd`);
    const res = await GET(req, { params: Promise.resolve({ hash, index: "0" }) });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid path/i);
  });

  it("returns 400 for missing filename", async () => {
    const hash = sha256(FAKE_PNG);
    const { GET } = await import("../app/api/triage/cropped/[hash]/[index]/route");
    const req = new Request(`http://localhost/api/triage/cropped/${hash}/0`);
    const res = await GET(req, { params: Promise.resolve({ hash, index: "0" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when hash does not match file content", async () => {
    await fs.writeFile(path.join(screenshotDir, "shot.png"), FAKE_PNG);
    const wrongHash = "b".repeat(64);

    const { GET } = await import("../app/api/triage/cropped/[hash]/[index]/route");
    const req = new Request(`http://localhost/api/triage/cropped/${wrongHash}/0?filename=shot.png`);
    const res = await GET(req, { params: Promise.resolve({ hash: wrongHash, index: "0" }) });
    expect(res.status).toBe(404);
  });

  it("does not write crop output to disk", async () => {
    const cropBytes = Buffer.from("cropped-data");
    await fs.writeFile(path.join(screenshotDir, "shot.png"), FAKE_PNG);
    const hash = sha256(FAKE_PNG);

    const { cropForVision } = await import("@/lib/triage/crop");
    (cropForVision as ReturnType<typeof vi.fn>).mockResolvedValue({
      images: [{ bytes: cropBytes, mediaType: "image/png" as const }],
      detected: true,
      resized: false,
      encodedBytes: Math.ceil(cropBytes.length / 3) * 4,
    });

    const { GET } = await import("../app/api/triage/cropped/[hash]/[index]/route");
    const req = new Request(`http://localhost/api/triage/cropped/${hash}/0?filename=shot.png`);
    await GET(req, { params: Promise.resolve({ hash, index: "0" }) });

    // Only the source screenshot should be in the screenshots directory
    const screenshotFiles = await fs.readdir(screenshotDir);
    expect(screenshotFiles).toEqual(["shot.png"]);

    // Data dir should only have the screenshots subdirectory
    const dataFiles = await fs.readdir(tmpDir);
    expect(dataFiles).toEqual(["screenshots"]);
  });
});
