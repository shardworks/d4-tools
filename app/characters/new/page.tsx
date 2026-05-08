import Link from "next/link";
import { CharacterEditor } from "@/components/d4/CharacterEditor";

export const metadata = { title: "New Character — D4 Tools" };

export default function NewCharacterPage() {
  return (
    <div className="max-w-[720px] p-6">
      {/* D19: Top banner offering Battle.net import as an alternative to manual entry */}
      <div className="mb-5 px-[14px] py-[10px] rounded-md bg-warning/6 border border-warning/25 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-stone-400">
          Have a character in Diablo IV?{" "}
          <span className="text-stone-300">Skip manual entry.</span>
        </span>
        <Link
          href="/import"
          className="px-[14px] py-[6px] rounded-[5px] bg-accent text-black text-xs font-bold no-underline shrink-0 hover:bg-accent/90"
        >
          Import from Battle.net
        </Link>
      </div>

      <CharacterEditor isNew />
    </div>
  );
}
