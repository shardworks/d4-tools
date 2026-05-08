import { notFound } from "next/navigation";
import { loadBuild } from "@/lib/persistence/builds";
import { loadCharacter } from "@/lib/persistence/characters";
import { setActiveBuildId } from "@/lib/persistence/active-build";
import { BuildDetailClient } from "./BuildDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const build = await loadBuild(id).catch(() => null);
  return { title: build ? `${build.name} — D4 Tools` : "Build — D4 Tools" };
}

export default async function BuildDetailPage({ params }: Props) {
  const { id } = await params;

  // Mark this build as active server-side on each visit (D5).
  // Best-effort — don't block render on write failure.
  setActiveBuildId(id).catch(() => undefined);

  let build;
  try {
    build = await loadBuild(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error loading build";
    return (
      <div className="p-6 text-destructive font-mono text-sm whitespace-pre-wrap">
        <strong>Error loading build:</strong>
        {"\n\n"}
        {message}
      </div>
    );
  }

  if (!build) notFound();

  let character;
  try {
    character = await loadCharacter(build.characterId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error loading character";
    return (
      <div className="p-6 text-destructive font-mono text-sm whitespace-pre-wrap">
        <strong>Error loading character for build:</strong>
        {"\n\n"}
        {message}
      </div>
    );
  }

  if (!character) {
    return (
      <div className="p-6 text-stone-400 text-sm">
        Character not found for this build (id: {build.characterId}).
      </div>
    );
  }

  return <BuildDetailClient build={build} character={character} />;
}
