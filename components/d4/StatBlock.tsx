type StatBlockProps = {
  stats: Array<{ label: string; value: string }>;
};

export function StatBlock({ stats }: StatBlockProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--surface-2)",
        borderRadius: "var(--radius-panel)",
        border: "1px solid var(--stone-800)",
        overflow: "hidden",
      }}
    >
      {stats.map((stat, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 12px",
            borderBottom: i < stats.length - 1 ? "1px solid var(--stone-800)" : undefined,
            fontSize: "13px",
          }}
        >
          <span style={{ color: "var(--stone-400)" }}>{stat.label}</span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              color: "var(--stone-100)",
              textAlign: "right",
            }}
          >
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}
