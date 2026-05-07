type HeaderBarProps = {
  characterName?: string;
  buildName?: string;
};

export function HeaderBar({
  characterName = "Demo Character",
  buildName = "Demo Build",
}: HeaderBarProps) {
  return (
    <header
      style={{
        height: "40px",
        minHeight: "40px",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: "8px",
        backgroundColor: "var(--surface-1)",
        borderBottom: "1px solid var(--stone-800)",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--stone-200)",
        }}
      >
        {characterName}
      </span>
      <span style={{ color: "var(--stone-600)", fontSize: "13px" }}>—</span>
      <span
        style={{
          fontSize: "13px",
          color: "var(--stone-400)",
        }}
      >
        {buildName}
      </span>
    </header>
  );
}
