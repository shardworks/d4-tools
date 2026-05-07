import Link from "next/link";
import { listBuilds } from "@/lib/persistence/builds";
import { listCharacters } from "@/lib/persistence/characters";
import type { Build, Character } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { Plus, PenSquare } from "lucide-react";

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
    <div style={{ padding: "24px", maxWidth: "900px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <h1
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "var(--stone-100)",
            margin: 0,
          }}
        >
          Builds
        </h1>
        <Link href="/characters/new">
          <Button style={{ gap: "6px" }}>
            <Plus size={14} />
            New Character
          </Button>
        </Link>
      </div>

      {/* Error display */}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "6px",
            color: "#ef4444",
            fontSize: "13px",
            fontFamily: "monospace",
            marginBottom: "16px",
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      )}

      {/* Empty state */}
      {!error && builds.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "48px 24px",
            color: "var(--stone-500)",
            fontSize: "14px",
          }}
        >
          <p>No builds yet.</p>
          <Link href="/characters/new">
            <Button variant="outline" style={{ marginTop: "12px", gap: "6px" }}>
              <Plus size={14} />
              Create your first character
            </Button>
          </Link>
        </div>
      )}

      {/* Build list */}
      {builds.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 180px 100px 80px 80px",
              padding: "6px 12px",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--stone-500)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              borderBottom: "1px solid var(--stone-800)",
            }}
          >
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
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 180px 100px 80px 80px",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--stone-800)",
                    background: "var(--surface-2)",
                    alignItems: "center",
                    cursor: "pointer",
                    transition: "border-color 100ms, background 100ms",
                  }}
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
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--stone-100)" }}>
                      {char?.name ?? build.characterId}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--accent)", marginTop: "2px" }}>
                      {build.name}
                    </div>
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--stone-400)" }}>
                    {char?.class ?? "—"}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--stone-400)" }}>
                    {char ? `Lvl ${char.level}` : "—"}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--stone-400)" }}>
                    {char ? `P${char.paragonAllocation.paragonLevel}` : "—"}
                  </span>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Link
                      href={`/characters/${build.characterId}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{ textDecoration: "none" }}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ gap: "4px", fontSize: "11px", height: "26px", padding: "0 8px" }}
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
