/**
 * GET /api/blizzard/import/[heroId]
 *
 * Fetches a hero's detail + equipped items, converts to a canonical Character draft,
 * and returns it for preview on the import confirm screen.
 *
 * Query params:
 *   realm: "seasonal" | "eternal" (default: "seasonal")
 *
 * Response: { character, buildName, warnings, existingCharacterId? }
 *   - character: Omit<Character, "id"> ready to POST to /api/characters
 *   - buildName: suggested build name (D16: same as character name)
 *   - warnings: ImportWarning[] for the preview banner (D14)
 *   - existingCharacterId: string | null — if a prior import of the same heroId+realm+region
 *     exists, its id is returned so the confirm screen can offer "Update existing" (D13)
 *
 * Failure modes (D21):
 * - 401 → requiresSignIn: true
 * - 429 → rateLimited + retryAfter
 * - 403 (private profile) → privateProfile: true
 */

import { NextResponse } from "next/server";
import { isSafeId } from "@/lib/persistence/paths";
import { listCharacters } from "@/lib/persistence/characters";
import { BlizzardClient, heroRealmSlug } from "@/lib/blizzard/client";
import { BnetApiError } from "@/lib/blizzard/types";
import { buildResolvers } from "@/lib/blizzard/resolvers";
import { convertBnetHero } from "@/lib/blizzard/import";
import {
  affixes,
  aspects,
  classes,
  slots,
  getSkillsForClass,
  getParagonCatalogForClass,
} from "@/lib/catalog";

type Params = { params: Promise<{ heroId: string }> };

function badId() {
  return NextResponse.json(
    { error: "Invalid heroId: must be alphanumeric" },
    { status: 400 }
  );
}

export async function GET(request: Request, { params }: Params) {
  const { heroId: heroIdStr } = await params;

  // isSafeId validates alphanumeric — heroId is a numeric string, which passes
  if (!isSafeId(heroIdStr)) return badId();

  const heroId = parseInt(heroIdStr, 10);
  if (isNaN(heroId) || heroId <= 0) return badId();

  const url = new URL(request.url);
  const realmParam = url.searchParams.get("realm");
  const realm = realmParam === "eternal" ? "eternal" : "seasonal";

  // Initialise client from stored tokens
  let client: BlizzardClient;
  try {
    client = await BlizzardClient.fromStoredTokens();
  } catch {
    return NextResponse.json(
      { error: "Not signed in to Battle.net. Visit /settings to connect.", requiresSignIn: true },
      { status: 401 }
    );
  }

  // Read region from stored tokens (loaded inside client creation)
  const { loadTokens } = await import("@/lib/blizzard/tokens");
  const tokens = await loadTokens();
  const region = tokens?.region ?? "americas";

  // Determine current season from the hero detail (we'll read it from the hero response)
  let hero;
  let items;
  try {
    [hero, items] = await Promise.all([
      client.fetchHero(heroId, realm),
      client.fetchHeroItems(heroId, realm),
    ]);
  } catch (err) {
    if (err instanceof BnetApiError) {
      if (err.status === 429) {
        const retryAfter = err.message.match(/(\d+)/)?.[1];
        return NextResponse.json(
          { error: err.message, rateLimited: true, retryAfter: retryAfter ? Number(retryAfter) : null },
          { status: 429 }
        );
      }
      if (err.status === 403) {
        return NextResponse.json(
          {
            error: "Profile access restricted — either the profile is private or the requested data is unavailable.",
            privateProfile: true,
          },
          { status: 403 }
        );
      }
      if (err.status === 401) {
        return NextResponse.json(
          { error: "Session expired. Sign in again to continue.", requiresSignIn: true },
          { status: 401 }
        );
      }
    }
    const message = err instanceof Error ? err.message : "Failed to fetch hero data";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Build resolvers from the full catalog
  // Use the hero's class to get class-specific skill/paragon catalogs
  const className = hero.class.charAt(0).toUpperCase() + hero.class.slice(1);
  const skillsForClass = getSkillsForClass(className);
  const paragonForClass = getParagonCatalogForClass(className);

  const resolvers = buildResolvers({
    affixes,
    aspects,
    classes,
    slots,
    skills: skillsForClass,
    boards: paragonForClass.boards,
    glyphs: paragonForClass.glyphs,
  });

  // Derive the current season string (null = eternal)
  const season = hero.seasonal
    ? (hero.seasonCreatedIn != null ? String(hero.seasonCreatedIn) : "13")
    : null;

  // Convert the hero to canonical shape
  let conversionResult;
  try {
    conversionResult = convertBnetHero(hero, items, region, resolvers, season);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import conversion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // D13: Check if a prior import of the same heroId+realm+region already exists
  let existingCharacterId: string | null = null;
  try {
    const existing = await listCharacters();
    const match = existing.find(
      (c) =>
        c.import?.heroId === heroId &&
        c.import?.realm === realm &&
        c.import?.region === region
    );
    existingCharacterId = match?.id ?? null;
  } catch {
    // Non-fatal — proceed without re-import detection
  }

  return NextResponse.json({
    character: conversionResult.character,
    buildName: conversionResult.buildName,
    warnings: conversionResult.warnings,
    existingCharacterId,
  });
}
