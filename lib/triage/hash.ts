import { createHash } from "crypto";

/**
 * Computes the SHA-256 hash of a Buffer and returns it as a hex string.
 * Used as the content-hash cache key for screenshot files (D15).
 */
export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
