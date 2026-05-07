import { notFound } from "next/navigation";
import { loadCharacter } from "@/lib/persistence/characters";
import { CharacterEditor } from "@/components/d4/CharacterEditor";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const character = await loadCharacter(id).catch(() => null);
  return { title: character ? `${character.name} — D4 Tools` : "Character — D4 Tools" };
}

export default async function CharacterDetailPage({ params }: Props) {
  const { id } = await params;

  let character;
  try {
    character = await loadCharacter(id);
  } catch (err) {
    // Zod validation failure or parse error — surface it
    const message = err instanceof Error ? err.message : "Unknown error loading character";
    return (
      <div
        style={{
          padding: "24px",
          color: "#ef4444",
          fontFamily: "monospace",
          fontSize: "13px",
          whiteSpace: "pre-wrap",
        }}
      >
        <strong>Error loading character:</strong>
        {"\n\n"}
        {message}
      </div>
    );
  }

  if (!character) notFound();

  return (
    <div style={{ maxWidth: "720px", padding: "24px" }}>
      <CharacterEditor character={character} />
    </div>
  );
}
