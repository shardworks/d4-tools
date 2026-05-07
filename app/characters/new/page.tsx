import { CharacterEditor } from "@/components/d4/CharacterEditor";

export const metadata = { title: "New Character — D4 Tools" };

export default function NewCharacterPage() {
  return (
    <div style={{ maxWidth: "720px", padding: "24px" }}>
      <CharacterEditor isNew />
    </div>
  );
}
