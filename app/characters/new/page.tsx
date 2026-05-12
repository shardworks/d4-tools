import Link from "next/link";
import { CharacterEditor } from "@/components/d4/CharacterEditor";

export const metadata = { title: "New Character — D4 Tools" };

export default function NewCharacterPage() {
  return (
    <div className="max-w-[720px] p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[20px] font-bold text-stone-100 m-0">New Character</h1>
        <Link
          href="/import/maxroll"
          className="text-xs text-accent hover:text-amber-300 transition-colors flex items-center gap-1"
        >
          Import from Maxroll instead →
        </Link>
      </div>
      <CharacterEditor isNew />
    </div>
  );
}
