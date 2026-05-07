"use client";

/**
 * Client component for /settings (D20).
 *
 * Renders as a single tall scrollable page with anchor links (visual-spec §15 settings archetype).
 * Sections: Region (D8) and Battle.net Connection.
 *
 * Anchor IDs: #region, #battlenet
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Region = "americas" | "europe" | "asia";

interface SettingsPageClientProps {
  initialRegion: Region | null;
  initialIsConnected: boolean;
}

const REGION_OPTIONS: { value: Region; label: string; description: string }[] = [
  { value: "americas", label: "Americas", description: "us.api.blizzard.com" },
  { value: "europe", label: "Europe", description: "eu.api.blizzard.com" },
  { value: "asia", label: "Asia", description: "kr.api.blizzard.com" },
];

const labelStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--stone-300)",
  display: "block",
  marginBottom: "4px",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "var(--stone-100)",
  margin: "0 0 4px 0",
};

const sectionDescStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "var(--stone-500)",
  margin: "0 0 20px 0",
};

const dividerStyle: React.CSSProperties = {
  height: "1px",
  background: "var(--stone-800)",
  margin: "32px 0",
};

const radioRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "10px 12px",
  borderRadius: "6px",
  border: "1px solid var(--stone-800)",
  background: "var(--surface-2)",
  cursor: "pointer",
  marginBottom: "8px",
};

const statusBadgeStyle = (connected: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "4px 10px",
  borderRadius: "9999px",
  fontSize: "12px",
  fontWeight: 600,
  background: connected ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
  color: connected ? "#22c55e" : "#ef4444",
  border: `1px solid ${connected ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
});

export function SettingsPageClient({ initialRegion, initialIsConnected }: SettingsPageClientProps) {
  const [region, setRegion] = useState<Region | null>(initialRegion);
  const [isConnected, setIsConnected] = useState(initialIsConnected);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const router = useRouter();

  async function handleRegionChange(newRegion: Region) {
    setRegion(newRegion);
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region: newRegion }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save region setting");
      } else {
        toast.success(`Region set to ${REGION_OPTIONS.find((r) => r.value === newRegion)?.label}`);
      }
    } catch {
      toast.error("Network error saving region");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/auth/battlenet/disconnect", { method: "POST" });
      if (res.ok) {
        setIsConnected(false);
        toast.success("Disconnected from Battle.net");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to disconnect");
      }
    } catch {
      toast.error("Network error during disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div
      style={{
        padding: "24px",
        maxWidth: "640px",
        display: "flex",
        flexDirection: "column",
        gap: "0",
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--stone-100)", margin: "0 0 6px 0" }}>
          Settings
        </h1>
        <p style={{ fontSize: "13px", color: "var(--stone-500)", margin: 0 }}>
          Configure Battle.net connection and region for character import.
        </p>
      </div>

      {/* Anchor nav */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          marginBottom: "32px",
          borderBottom: "1px solid var(--stone-800)",
          paddingBottom: "12px",
        }}
      >
        {[
          { href: "#region", label: "Region" },
          { href: "#battlenet", label: "Battle.net" },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            style={{
              fontSize: "13px",
              color: "var(--stone-400)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            {link.label}
          </a>
        ))}
      </div>

      {/* ── Section: Region ──────────────────────────────────────── */}
      <div id="region" style={{ scrollMarginTop: "80px" }}>
        <h2 style={sectionHeadingStyle}>Region</h2>
        <p style={sectionDescStyle}>
          Select the Battle.net region your D4 account is on. This determines which API server is
          used when fetching your character roster.
        </p>

        {REGION_OPTIONS.map((opt) => {
          const isSelected = region === opt.value;
          return (
            <label
              key={opt.value}
              style={{
                ...radioRowStyle,
                borderColor: isSelected ? "var(--accent)" : "var(--stone-800)",
                background: isSelected ? "rgba(var(--accent-rgb, 234,179,8), 0.08)" : "var(--surface-2)",
              }}
            >
              <input
                type="radio"
                name="region"
                value={opt.value}
                checked={isSelected}
                disabled={saving}
                onChange={() => handleRegionChange(opt.value)}
                style={{ accentColor: "var(--accent)" }}
              />
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--stone-100)" }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: "11px", color: "var(--stone-500)", fontFamily: "monospace" }}>
                  {opt.description}
                </div>
              </div>
            </label>
          );
        })}

        {!region && (
          <p style={{ fontSize: "12px", color: "var(--stone-500)", marginTop: "8px" }}>
            No region selected. Import from Battle.net will use Americas by default until you choose one.
          </p>
        )}
      </div>

      <div style={dividerStyle} />

      {/* ── Section: Battle.net Connection ───────────────────────── */}
      <div id="battlenet" style={{ scrollMarginTop: "80px" }}>
        <h2 style={sectionHeadingStyle}>Battle.net Connection</h2>
        <p style={sectionDescStyle}>
          Connect your Battle.net account to import characters from Diablo IV.
          Sign in once; tokens are stored locally in your data directory.
        </p>

        {/* Connection status badge */}
        <div style={{ marginBottom: "20px" }}>
          <span style={labelStyle}>Status</span>
          <div style={statusBadgeStyle(isConnected)}>
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: isConnected ? "#22c55e" : "#ef4444",
                flexShrink: 0,
              }}
            />
            {isConnected ? "Connected" : "Not connected"}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {!isConnected ? (
            <a
              href="/api/auth/battlenet/start"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "6px",
                background: "var(--accent)",
                color: "#000",
                fontSize: "13px",
                fontWeight: 600,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              Sign in with Battle.net
            </a>
          ) : (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "6px",
                background: "transparent",
                border: "1px solid rgba(239,68,68,0.5)",
                color: "#ef4444",
                fontSize: "13px",
                fontWeight: 600,
                cursor: disconnecting ? "not-allowed" : "pointer",
                opacity: disconnecting ? 0.6 : 1,
              }}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          )}

          {isConnected && (
            <button
              onClick={() => router.push("/import")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "6px",
                background: "var(--surface-2)",
                border: "1px solid var(--stone-700)",
                color: "var(--stone-200)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Import Character →
            </button>
          )}
        </div>

        {!process.env.NEXT_PUBLIC_BNET_CONFIGURED && (
          <div
            style={{
              marginTop: "16px",
              padding: "10px 12px",
              borderRadius: "6px",
              background: "rgba(234,179,8,0.08)",
              border: "1px solid rgba(234,179,8,0.3)",
              fontSize: "12px",
              color: "var(--stone-400)",
            }}
          >
            <strong style={{ color: "var(--stone-200)" }}>Setup required:</strong> Set{" "}
            <code style={{ fontFamily: "monospace" }}>BLIZZARD_CLIENT_ID</code> and{" "}
            <code style={{ fontFamily: "monospace" }}>BLIZZARD_CLIENT_SECRET</code> env vars.
            Register your application at{" "}
            <a
              href="https://develop.battle.net/access/clients"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              develop.battle.net
            </a>
            .
          </div>
        )}
      </div>
    </div>
  );
}
