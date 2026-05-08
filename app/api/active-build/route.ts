import { NextResponse } from "next/server";
import { getActiveBuildId, setActiveBuildId } from "@/lib/persistence/active-build";

/** GET /api/active-build — read the active build pointer */
export async function GET() {
  try {
    const buildId = await getActiveBuildId();
    if (!buildId) {
      return NextResponse.json({ buildId: null });
    }
    return NextResponse.json({ buildId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read active build";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PUT /api/active-build — write the active build pointer */
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { buildId?: unknown }).buildId !== "string"
  ) {
    return NextResponse.json({ error: "Missing required field: buildId" }, { status: 400 });
  }

  const { buildId } = body as { buildId: string };

  try {
    await setActiveBuildId(buildId);
    return NextResponse.json({ buildId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to set active build";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
