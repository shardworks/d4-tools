import { CharacterEditor } from "@/components/d4/CharacterEditor";

export const metadata = { title: "New Character — D4 Tools" };

export default function NewCharacterPage() {
  return (
    <div className="max-w-[720px] p-6">
      <CharacterEditor isNew />
    </div>
  );
}
