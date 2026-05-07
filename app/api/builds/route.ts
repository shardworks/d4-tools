import { NextResponse } from "next/server";
import { listBuilds, saveBuild } from "@/lib/persistence";
import { BuildSchema } from "@/lib/schema";

/** GET /api/builds?characterId=<id> — list all builds (optionally filtered by characterId) */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const characterId = searchParams.get("characterId") ?? undefined;
    const builds = await listBuilds(characterId);
    return NextResponse.json(builds);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list builds";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/builds — create a new build */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = BuildSchema.omit({ id: true }).parse(body);
    const build = await saveBuild(parsed);
    return NextResponse.json(build, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create build";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
