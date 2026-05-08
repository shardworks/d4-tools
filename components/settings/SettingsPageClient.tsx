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
import { cn } from "@/lib/utils";

type Region = "americas" | "europe" | "asia";

interface SettingsPageClientProps {
  initialRegion: Region | null;
  initialIsConnected: boolean;
  /** True when BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET are set server-side. */
  isBnetConfigured: boolean;
}

const REGION_OPTIONS: { value: Region; label: string; description: string }[] = [
  { value: "americas", label: "Americas", description: "us.api.blizzard.com" },
  { value: "europe", label: "Europe", description: "eu.api.blizzard.com" },
  { value: "asia", label: "Asia", description: "kr.api.blizzard.com" },
];

export function SettingsPageClient({ initialRegion, initialIsConnected, isBnetConfigured }: SettingsPageClientProps) {
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
    <div className="p-6 max-w-[640px] flex flex-col">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-stone-100 m-0 mb-[6px]">Settings</h1>
        <p className="text-sm text-stone-500 m-0">
          Configure Battle.net connection and region for character import.
        </p>
      </div>

      {/* Anchor nav */}
      <div className="flex gap-4 mb-8 border-b border-stone-800 pb-3">
        {[
          { href: "#region", label: "Region" },
          { href: "#battlenet", label: "Battle.net" },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="text-sm text-stone-400 no-underline font-medium hover:text-stone-300"
          >
            {link.label}
          </a>
        ))}
      </div>

      {/* ── Section: Region ──────────────────────────────────────────── */}
      <div id="region" className="scroll-mt-20">
        <h2 className="text-md font-bold text-stone-100 m-0 mb-1">Region</h2>
        <p className="text-sm text-stone-500 m-0 mb-5">
          Select the Battle.net region your D4 account is on. This determines which API server is
          used when fetching your character roster.
        </p>

        {REGION_OPTIONS.map((opt) => {
          const isSelected = region === opt.value;
          return (
            <label
              key={opt.value}
              className={cn(
                "flex items-center gap-[10px] px-3 py-[10px] rounded-md border cursor-pointer mb-2 bg-surface-2",
                isSelected ? "border-accent bg-accent/8" : "border-stone-800 hover:border-stone-600"
              )}
            >
              <input
                type="radio"
                name="region"
                value={opt.value}
                checked={isSelected}
                disabled={saving}
                onChange={() => handleRegionChange(opt.value)}
                className="accent-accent"
              />
              <div>
                <div className="text-sm font-semibold text-stone-100">{opt.label}</div>
                <div className="text-[11px] text-stone-500 font-mono">{opt.description}</div>
              </div>
            </label>
          );
        })}

        {!region && (
          <p className="text-xs text-stone-500 mt-2">
            No region selected. Import from Battle.net will use Americas by default until you choose one.
          </p>
        )}
      </div>

      <div className="h-px bg-stone-800 my-8" />

      {/* ── Section: Battle.net Connection ───────────────────────────── */}
      <div id="battlenet" className="scroll-mt-20">
        <h2 className="text-md font-bold text-stone-100 m-0 mb-1">Battle.net Connection</h2>
        <p className="text-sm text-stone-500 m-0 mb-5">
          Connect your Battle.net account to import characters from Diablo IV.
          Sign in once; tokens are stored locally in your data directory.
        </p>

        {/* Connection status badge */}
        <div className="mb-5">
          <span className="text-sm font-semibold text-stone-300 block mb-1">Status</span>
          <div
            className={cn(
              "inline-flex items-center gap-[6px] px-[10px] py-1 rounded-full text-xs font-semibold",
              isConnected
                ? "border border-success/30 bg-success/12 text-success"
                : "border border-destructive/30 bg-destructive/12 text-destructive"
            )}
          >
            <span
              className={cn(
                "w-[6px] h-[6px] rounded-full shrink-0",
                isConnected ? "bg-success" : "bg-destructive"
              )}
            />
            {isConnected ? "Connected" : "Not connected"}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-[10px] items-center">
          {!isConnected ? (
            <a
              href="/api/auth/battlenet/start"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-accent text-black text-sm font-semibold no-underline cursor-pointer hover:bg-accent/90"
            >
              Sign in with Battle.net
            </a>
          ) : (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-md bg-transparent border border-destructive/50 text-destructive text-sm font-semibold",
                disconnecting ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-destructive/20"
              )}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          )}

          {isConnected && (
            <button
              onClick={() => router.push("/import")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-surface-2 border border-stone-700 text-stone-200 text-sm font-semibold cursor-pointer hover:bg-stone-800"
            >
              Import Character →
            </button>
          )}
        </div>

        {!isBnetConfigured && (
          <div className="mt-4 px-3 py-[10px] rounded-md bg-warning/8 border border-warning/30 text-xs text-stone-400">
            <strong className="text-stone-200">Setup required:</strong> Set{" "}
            <code className="font-mono">BLIZZARD_CLIENT_ID</code> and{" "}
            <code className="font-mono">BLIZZARD_CLIENT_SECRET</code> env vars.
            Register your application at{" "}
            <a
              href="https://develop.battle.net/access/clients"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent no-underline"
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
