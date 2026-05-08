import { NextResponse } from "next/server";
import { getCachedParse } from "@/lib/triage/cache";

type Params = { params: Promise<{ hash: string }> };

/** GET /api/triage/cache/[hash] — read a cached parse entry by SHA-256 hash */
export async function GET(_req: Request, { params }: Params) {
  const { hash } = await params;

  // Validate hash — SHA-256 hex strings are 64 lowercase hex characters
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return NextResponse.json({ error: "Invalid hash format" }, { status: 400 });
  }

  try {
    const entry = await getCachedParse(hash);
    if (!entry) {
      return NextResponse.json({ error: "Cache entry not found" }, { status: 404 });
    }
    return NextResponse.json(entry);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read cache entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
