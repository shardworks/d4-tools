import { NextResponse } from "next/server";
import { readJsonFile, writeJsonFile } from "@/lib/persistence";

export async function GET() {
  const characters = await readJsonFile("characters.json");
  return NextResponse.json(characters ?? []);
}

export async function POST(request: Request) {
  const body = await request.json();
  const characters = (await readJsonFile<unknown[]>("characters.json")) ?? [];
  characters.push(body);
  await writeJsonFile("characters.json", characters);
  return NextResponse.json(body, { status: 201 });
}
