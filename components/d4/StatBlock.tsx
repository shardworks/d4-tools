type StatBlockProps = {
  stats: Array<{ label: string; value: string }>;
};

export function StatBlock({ stats }: StatBlockProps) {
  return (
    <div className="panel flex flex-col overflow-hidden">
      {stats.map((stat, i) => (
        <div
          key={i}
          className={`flex justify-between items-center px-3 py-[6px] text-sm${
            i < stats.length - 1 ? " border-b border-stone-800" : ""
          }`}
        >
          <span className="text-stone-400">{stat.label}</span>
          <span className="font-mono tabular-nums text-stone-100 text-right">
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}
