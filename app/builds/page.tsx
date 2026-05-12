import Link from "next/link";
import { listBuilds } from "@/lib/persistence/builds";
import { listCharacters } from "@/lib/persistence/characters";
import type { Build, Character } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { Plus, PenSquare, Download } from "lucide-react";

export const metadata = { title: "Builds — D4 Tools" };

export default async function BuildsListPage() {
  let builds: Build[] = [];
  let characters: Character[] = [];
  let error: string | null = null;

  try {
    [builds, characters] = await Promise.all([listBuilds(), listCharacters()]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load builds";
  }

  // Index characters by id for quick lookup
  const charById: Record<string, Character> = {};
  for (const c of characters) charById[c.id] = c;

  return (
    <div className="p-6 max-w-[900px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[20px] font-bold text-stone-100 m-0">Builds</h1>
        <div className="flex gap-2">
          <Link href="/import/maxroll">
            <Button variant="outline" className="gap-[6px]">
              <Download size={14} />
              Import from Maxroll
            </Button>
          </Link>
          <Link href="/characters/new">
            <Button className="gap-[6px]">
              <Plus size={14} />
              New Character
            </Button>
          </Link>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="error-banner font-mono whitespace-pre-wrap mb-4 block">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!error && builds.length === 0 && (
        <div className="text-center py-12 px-6 text-stone-500 text-base">
          <p>No builds yet.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mt-3">
            <Link href="/characters/new">
              <Button variant="outline" className="gap-[6px]">
                <Plus size={14} />
                Create your first character
              </Button>
            </Link>
            <Link href="/import/maxroll">
              <Button variant="outline" className="gap-[6px]">
                <Download size={14} />
                Import from Maxroll
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Build list */}
      {builds.length > 0 && (
        <div className="flex flex-col gap-[6px]">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_180px_100px_80px_80px] gap-0 px-3 py-[6px] text-[11px] font-semibold text-stone-500 uppercase tracking-[0.06em] border-b border-stone-800">
            <span>Character / Build</span>
            <span>Class</span>
            <span>Level</span>
            <span>Paragon</span>
            <span></span>
          </div>

          {builds.map((build) => {
            const char = charById[build.characterId];
            // Row is a sibling layout, not nested links: the four data cells live
            // inside one Link (display:contents lets them participate as direct
            // grid items), and the Edit cell is a separate sibling with its own
            // Link. This avoids the prior nested-Link + onClick stopPropagation
            // pattern, which is invalid in a server component (event handlers
            // cannot be passed across the server→client boundary).
            return (
              <div
                key={build.id}
                className="grid grid-cols-[1fr_180px_100px_80px_80px] px-3 py-[10px] rounded-md border border-stone-800 bg-surface-2 items-center cursor-pointer transition-[border-color,background] duration-100 hover:border-stone-600 hover:bg-surface-1"
              >
                <Link
                  href={`/builds/${build.id}`}
                  className="contents no-underline"
                >
                  <div>
                    <div className="text-sm font-semibold text-stone-100">
                      {char?.name ?? build.characterId}
                    </div>
                    <div className="text-[11px] text-accent mt-0.5">
                      {build.name}
                    </div>
                  </div>
                  <span className="text-xs text-stone-400">{char?.class ?? "—"}</span>
                  <span className="text-xs text-stone-400 tabular-nums">
                    {char ? `Lvl ${char.level}` : "—"}
                  </span>
                  <span className="text-xs text-stone-400 tabular-nums">
                    {char ? `P${char.paragonAllocation.paragonLevel}` : "—"}
                  </span>
                </Link>
                <div className="flex justify-end">
                  <Link
                    href={`/characters/${build.characterId}`}
                    className="no-underline"
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-[11px] px-2"
                      title="Edit character"
                    >
                      <PenSquare size={12} />
                      Edit
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
