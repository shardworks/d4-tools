import Link from "next/link";
import { listBuilds } from "@/lib/persistence/builds";
import { listCharacters } from "@/lib/persistence/characters";
import type { Build, Character } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { Plus, PenSquare, CloudDownload } from "lucide-react";

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
          <Link href="/import">
            <Button variant="outline" className="gap-[6px]">
              <CloudDownload size={14} />
              Import from Battle.net
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
          <Link href="/characters/new">
            <Button variant="outline" className="mt-3 gap-[6px]">
              <Plus size={14} />
              Create your first character
            </Button>
          </Link>
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
            return (
              <Link
                key={build.id}
                href={`/builds/${build.id}`}
                className="no-underline"
              >
                <div
                  className="grid grid-cols-[1fr_180px_100px_80px_80px] px-3 py-[10px] rounded-md border border-stone-800 bg-surface-2 items-center cursor-pointer transition-[border-color,background] duration-100"
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--stone-600)";
                    (e.currentTarget as HTMLElement).style.background = "var(--surface-1)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--stone-800)";
                    (e.currentTarget as HTMLElement).style.background = "var(--surface-2)";
                  }}
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
                  <span className="text-xs text-stone-400">
                    {char ? `Lvl ${char.level}` : "—"}
                  </span>
                  <span className="text-xs text-stone-400">
                    {char ? `P${char.paragonAllocation.paragonLevel}` : "—"}
                  </span>
                  <div className="flex justify-end">
                    <Link
                      href={`/characters/${build.characterId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="no-underline"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-[11px] h-[26px] px-2"
                        title="Edit character"
                      >
                        <PenSquare size={12} />
                        Edit
                      </Button>
                    </Link>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
