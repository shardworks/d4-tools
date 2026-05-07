import { NextResponse } from "next/server";
import { loadCharacter, saveCharacter, deleteCharacter } from "@/lib/persistence";
import { CharacterSchema } from "@/lib/schema";
import { isSafeId } from "@/lib/persistence/paths";

type Params = { params: Promise<{ id: string }> };

function badId() {
  return NextResponse.json(
    { error: "Invalid character id: must match /^[a-z0-9-]+$/" },
    { status: 400 }
  );
}

/** GET /api/characters/[id] */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  if (!isSafeId(id)) return badId();

  try {
    const character = await loadCharacter(id);
    if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });
    return NextResponse.json(character);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load character";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PUT /api/characters/[id] */
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  if (!isSafeId(id)) return badId();

  try {
    const body = await request.json();
    const parsed = CharacterSchema.parse({ ...body, id });
    const character = await saveCharacter(parsed);
    return NextResponse.json(character);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save character";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE /api/characters/[id] */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  if (!isSafeId(id)) return badId();

  try {
    const deleted = await deleteCharacter(id);
    if (!deleted) return NextResponse.json({ error: "Character not found" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete character";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
