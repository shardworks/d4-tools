import Link from "next/link";
import { CharacterEditor } from "@/components/d4/CharacterEditor";

export const metadata = { title: "New Character — D4 Tools" };

export default function NewCharacterPage() {
  return (
    <div style={{ maxWidth: "720px", padding: "24px" }}>
      {/* D19: Top banner offering Battle.net import as an alternative to manual entry */}
      <div
        style={{
          marginBottom: "20px",
          padding: "10px 14px",
          borderRadius: "6px",
          background: "rgba(234,179,8,0.06)",
          border: "1px solid rgba(234,179,8,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "13px", color: "var(--stone-400)" }}>
          Have a character in Diablo IV?{" "}
          <span style={{ color: "var(--stone-300)" }}>Skip manual entry.</span>
        </span>
        <Link
          href="/import"
          style={{
            padding: "6px 14px",
            borderRadius: "5px",
            background: "var(--accent)",
            color: "#000",
            fontSize: "12px",
            fontWeight: 700,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          Import from Battle.net
        </Link>
      </div>

      <CharacterEditor isNew />
    </div>
  );
}
