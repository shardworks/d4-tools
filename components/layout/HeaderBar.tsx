type HeaderBarProps = {
  characterName?: string;
  buildName?: string;
};

export function HeaderBar({
  characterName = "Demo Character",
  buildName = "Demo Build",
}: HeaderBarProps) {
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
