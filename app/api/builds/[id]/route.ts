import { NextResponse } from "next/server";
import { loadBuild, saveBuild, deleteBuild } from "@/lib/persistence";
import { BuildSchema } from "@/lib/schema";
import { isSafeId } from "@/lib/persistence/paths";

type Params = { params: Promise<{ id: string }> };

function badId() {
  return NextResponse.json(
    { error: "Invalid build id: must match /^[a-z0-9-]+$/" },
    { status: 400 }
  );
}

/** GET /api/builds/[id] */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  if (!isSafeId(id)) return badId();

  try {
    const build = await loadBuild(id);
    if (!build) return NextResponse.json({ error: "Build not found" }, { status: 404 });
    return NextResponse.json(build);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load build";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PUT /api/builds/[id] */
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  if (!isSafeId(id)) return badId();

  try {
    const body = await request.json();
    const parsed = BuildSchema.parse({ ...body, id });
    const build = await saveBuild(parsed);
    return NextResponse.json(build);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save build";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE /api/builds/[id] */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  if (!isSafeId(id)) return badId();

  try {
    const deleted = await deleteBuild(id);
    if (!deleted) return NextResponse.json({ error: "Build not found" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete build";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
