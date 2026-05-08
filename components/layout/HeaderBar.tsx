import { getActiveBuildId } from "@/lib/persistence/active-build";
import { loadBuild } from "@/lib/persistence/builds";
import { loadCharacter } from "@/lib/persistence/characters";

/**
 * Server Component header bar.
 * Reads the active-build pointer server-side and renders real character/build names.
 * Renders '—' for both fields when no active build is set (D21).
 */
export async function HeaderBar() {
  let characterName = "—";
  let buildName = "—";

  try {
    const buildId = await getActiveBuildId();
    if (buildId) {
      const build = await loadBuild(buildId).catch(() => null);
      if (build) {
        buildName = build.name;
        const character = await loadCharacter(build.characterId).catch(() => null);
        if (character) {
          characterName = character.name;
        }
      }
    }
  } catch {
    // On error, fall through to '—' defaults
  }

  return (
    <header className="h-10 min-h-10 flex items-center px-4 gap-2 bg-surface-1 border-b border-stone-800 shrink-0">
      <span className="text-sm font-semibold text-stone-200">
        {characterName}
      </span>
      <span className="text-stone-600 text-sm">—</span>
      <span className="text-sm text-stone-400">
        {buildName}
      </span>
    </header>
  );
}
