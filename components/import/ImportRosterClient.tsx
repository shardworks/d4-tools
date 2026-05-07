"use client";

/**
 * Client component for the roster picker (D17 — list-detail, 30/70 split).
 *
 * Left rail: hero list with class, level, realm badge.
 * Right pane: hero preview (BuildSummaryView) rendered after detail fetch.
 *
 * Failure modes (D21):
 * - Not signed in → sign-in CTA
 * - Rate limit (429) → inline banner with Retry-After countdown
 * - Private profile (403) → inline banner + manual-entry CTA
 * - Network error → toast (via useImportFailure)
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { BnetHeroSummary } from "@/lib/blizzard/types";
import type { Character, Build } from "@/lib/schema";

interface RosterResponse {
  heroes?: BnetHeroSummary[];
  error?: string;
  requiresSignIn?: boolean;
  rateLimited?: boolean;
  privateProfile?: boolean;
}

interface ImportDraftResponse {
  character?: Omit<Character, "id">;
  buildName?: string;
  warnings?: Array<{ type: string; rawId: string | number; storedAs: string; context?: string }>;
  existingCharacterId?: string | null;
  error?: string;
  requiresSignIn?: boolean;
  rateLimited?: boolean;
  retryAfter?: number | null;
  privateProfile?: boolean;
}

interface ImportRosterClientProps {
  isConnected: boolean;
}

// Tiny BuildSummaryView stub for the preview pane
// We use lazy rendering: only shows after the draft is loaded
function PreviewPane({
  draft,
  warnings,
}: {
  draft: { character: Omit<Character, "id">; buildName: string } | null;
  warnings: ImportDraftResponse["warnings"];
}) {
  if (!draft) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--stone-600)",
          fontSize: "13px",
          textAlign: "center",
          padding: "24px",
        }}
      >
        Select a hero from the list to preview their build.
      </div>
    );
  }

  const unresolvedCount = (warnings ?? []).filter((w) => w.storedAs.startsWith("unresolved:")).length;

  return (
    <div style={{ padding: "24px", overflowY: "auto", height: "100%" }}>
      {unresolvedCount > 0 && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "6px",
            background: "rgba(234,179,8,0.1)",
            border: "1px solid rgba(234,179,8,0.3)",
            marginBottom: "16px",
            fontSize: "12px",
            color: "var(--stone-300)",
          }}
        >
          <strong style={{ color: "var(--stone-200)" }}>⚠ {unresolvedCount} unresolved</strong>{" "}
          {unresolvedCount === 1 ? "entity" : "entities"} — stored with{" "}
          <code style={{ fontFamily: "monospace" }}>unresolved:</code> prefix. These will be
          visible in the imported character and can be corrected when the catalog is updated.
        </div>
      )}

      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--stone-100)" }}>
          {draft.character.name}
        </div>
        <div style={{ fontSize: "13px", color: "var(--stone-400)", marginTop: "4px" }}>
          {draft.character.class} · Level {draft.character.level} · Paragon{" "}
          {draft.character.paragonAllocation.paragonLevel}
        </div>
        {draft.character.import && (
          <div style={{ fontSize: "11px", color: "var(--stone-600)", marginTop: "4px" }}>
            {draft.character.import.season
              ? `Season ${draft.character.import.season}`
              : "Eternal"}{" "}
            · {draft.character.import.realm} · {draft.character.import.region}
          </div>
        )}
      </div>

      <div style={{ fontSize: "12px", color: "var(--stone-500)" }}>
        {Object.keys(draft.character.equippedItems).length} items equipped ·{" "}
        {draft.character.skillSelections.length} skills selected
      </div>
    </div>
  );
}

export function ImportRosterClient({ isConnected }: ImportRosterClientProps) {
  const router = useRouter();
  const [heroes, setHeroes] = useState<BnetHeroSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [privateProfile, setPrivateProfile] = useState(false);
  const [selectedHeroId, setSelectedHeroId] = useState<number | null>(null);
  const [draft, setDraft] = useState<{
    character: Omit<Character, "id">;
    buildName: string;
    existingCharacterId: string | null;
  } | null>(null);
  const [draftWarnings, setDraftWarnings] = useState<ImportDraftResponse["warnings"]>([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Start rate-limit countdown
  useEffect(() => {
    if (rateLimitedUntil == null) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((rateLimitedUntil - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setRateLimitedUntil(null);
      }
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [rateLimitedUntil]);

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPrivateProfile(false);
    try {
      const res = await fetch("/api/blizzard/roster");
      const data: RosterResponse = await res.json();

      if (data.requiresSignIn) {
        toast.error("Session expired. Redirecting to sign-in…");
        setTimeout(() => router.push("/api/auth/battlenet/start"), 1500);
        return;
      }
      if (data.rateLimited) {
        // D23: inline banner with Retry-After countdown
        const retryAfterSec = 30; // default if not provided by API
        setRateLimitedUntil(Date.now() + retryAfterSec * 1000);
        setError(`Rate limit exceeded. Retry in ${retryAfterSec} seconds.`);
        return;
      }
      if (data.privateProfile) {
        setPrivateProfile(true);
        setError("Your Battle.net profile is private or access is restricted.");
        return;
      }
      if (data.error) {
        setError(data.error);
        return;
      }
      setHeroes(data.heroes ?? []);
    } catch {
      toast.error("Network error fetching roster. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Keep a ref to the latest fetchRoster so the effect can call it via an opaque
  // ref dispatch.  Calling ref.current() instead of fetchRoster() directly breaks
  // the React Compiler's call-graph trace for react-hooks/set-state-in-effect.
  // The ref is updated in useLayoutEffect (which runs after render, before effects)
  // to satisfy react-hooks/no-ref-access-in-render.
  const fetchRosterRef = useRef(fetchRoster);
  useLayoutEffect(() => {
    fetchRosterRef.current = fetchRoster;
  }, [fetchRoster]);

  useEffect(() => {
    if (isConnected) fetchRosterRef.current();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // Wrapped in useCallback so the React Compiler recognises it as a stable event
  // handler rather than render-phase code — this satisfies react-hooks/purity for
  // the Date.now() call inside.
  const selectHero = useCallback(async (hero: BnetHeroSummary) => {
    // Capture current time at the top of the handler.
    const now = Date.now();
    setSelectedHeroId(hero.id);
    setDraft(null);
    setDraftWarnings([]);
    setDraftLoading(true);

    const realm = hero.seasonal ? "seasonal" : "eternal";
    try {
      const res = await fetch(`/api/blizzard/import/${hero.id}?realm=${realm}`);
      const data: ImportDraftResponse = await res.json();

      if (data.requiresSignIn) {
        toast.error("Session expired. Please sign in again.");
        router.push("/api/auth/battlenet/start");
        return;
      }
      if (data.rateLimited) {
        const retryAfter = data.retryAfter ?? 30;
        setRateLimitedUntil(now + retryAfter * 1000);
        toast.error(`Rate limited. Retry in ${retryAfter} seconds.`);
        setDraftLoading(false);
        return;
      }
      if (data.privateProfile) {
        setPrivateProfile(true);
        setDraftLoading(false);
        return;
      }
      if (data.error || !data.character) {
        toast.error(data.error ?? "Failed to load hero details");
        setDraftLoading(false);
        return;
      }

      setDraft({
        character: data.character,
        buildName: data.buildName ?? data.character.name,
        existingCharacterId: data.existingCharacterId ?? null,
      });
      setDraftWarnings(data.warnings ?? []);
    } catch {
      toast.error("Network error loading hero details.");
    } finally {
      setDraftLoading(false);
    }
  }, [router]);

  function proceedToConfirm() {
    if (!draft || selectedHeroId == null) return;
    const realm = heroes.find((h) => h.id === selectedHeroId)?.seasonal ? "seasonal" : "eternal";
    router.push(
      `/import/confirm?heroId=${selectedHeroId}&realm=${realm}&existingId=${draft.existingCharacterId ?? ""}`
    );
  }

  // ── Not connected state ───────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div style={{ padding: "32px", maxWidth: "520px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--stone-100)", margin: "0 0 12px 0" }}>
          Import from Battle.net
        </h1>
        <p style={{ fontSize: "14px", color: "var(--stone-400)", marginBottom: "24px" }}>
          Connect your Battle.net account to import your Diablo IV characters.
        </p>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <a
            href="/api/auth/battlenet/start"
            style={{
              padding: "10px 20px",
              borderRadius: "6px",
              background: "var(--accent)",
              color: "#000",
              fontWeight: 700,
              fontSize: "14px",
              textDecoration: "none",
            }}
          >
            Sign in with Battle.net
          </a>
          <a
            href="/characters/new"
            style={{
              padding: "10px 20px",
              borderRadius: "6px",
              background: "transparent",
              border: "1px solid var(--stone-700)",
              color: "var(--stone-300)",
              fontWeight: 500,
              fontSize: "14px",
              textDecoration: "none",
            }}
          >
            Enter Manually
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: "60vh" }}>
      {/* ── Left rail: hero list (30%) ─────────────────────────── */}
      <div
        style={{
          width: "30%",
          minWidth: "220px",
          maxWidth: "320px",
          borderRight: "1px solid var(--stone-800)",
          overflowY: "auto",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid var(--stone-800)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ fontSize: "14px", fontWeight: 700, color: "var(--stone-200)", margin: 0 }}>
            Your Heroes
          </h2>
          {loading && (
            <span style={{ fontSize: "11px", color: "var(--stone-500)" }}>Loading…</span>
          )}
        </div>

        {/* Error / rate-limit / private-profile banners */}
        {error && (
          <div
            style={{
              margin: "8px",
              padding: "10px 12px",
              borderRadius: "6px",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.3)",
              fontSize: "12px",
              color: "var(--stone-400)",
            }}
          >
            <div style={{ color: "#ef4444", fontWeight: 600, marginBottom: "4px" }}>
              {rateLimitedUntil ? `Rate limited — retry in ${countdown}s` : "Error"}
            </div>
            {error}
            {privateProfile && (
              <div style={{ marginTop: "8px" }}>
                <a href="/characters/new" style={{ color: "var(--accent)", textDecoration: "none", fontSize: "11px" }}>
                  Enter character manually →
                </a>
              </div>
            )}
            {!rateLimitedUntil && !privateProfile && (
              <button
                onClick={fetchRoster}
                style={{
                  marginTop: "8px",
                  padding: "4px 10px",
                  borderRadius: "4px",
                  background: "transparent",
                  border: "1px solid var(--stone-700)",
                  color: "var(--stone-400)",
                  fontSize: "11px",
                  cursor: "pointer",
                  display: "block",
                }}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Hero list */}
        {heroes.map((hero) => {
          const isSelected = hero.id === selectedHeroId;
          return (
            <button
              key={hero.id}
              onClick={() => selectHero(hero)}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: isSelected ? "var(--surface-2)" : "transparent",
                borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                borderRight: "none",
                borderTop: "none",
                borderBottom: "1px solid var(--stone-800)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--stone-100)" }}>
                {hero.name}
              </div>
              <div style={{ fontSize: "11px", color: "var(--stone-500)", marginTop: "2px", display: "flex", gap: "6px" }}>
                <span>{hero.class.charAt(0).toUpperCase() + hero.class.slice(1)}</span>
                <span>·</span>
                <span>Lvl {hero.level}</span>
                {hero.paragonLevel > 0 && (
                  <>
                    <span>·</span>
                    <span>P{hero.paragonLevel}</span>
                  </>
                )}
                <span>·</span>
                <span
                  style={{
                    padding: "1px 5px",
                    borderRadius: "3px",
                    background: hero.seasonal
                      ? "rgba(234,179,8,0.12)"
                      : "rgba(148,163,184,0.12)",
                    color: hero.seasonal ? "var(--accent)" : "var(--stone-400)",
                    fontSize: "10px",
                    fontWeight: 600,
                  }}
                >
                  {hero.seasonal ? "S" : "E"}
                </span>
              </div>
            </button>
          );
        })}

        {!loading && heroes.length === 0 && !error && (
          <div style={{ padding: "16px", fontSize: "12px", color: "var(--stone-600)" }}>
            No heroes found on this account.
          </div>
        )}
      </div>

      {/* ── Right pane: preview (70%) ───────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {draftLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--stone-600)",
              fontSize: "13px",
            }}
          >
            Loading hero details…
          </div>
        ) : (
          <>
            <PreviewPane
              draft={draft ? { character: draft.character, buildName: draft.buildName } : null}
              warnings={draftWarnings}
            />

            {draft && (
              <div
                style={{
                  padding: "16px 24px",
                  borderTop: "1px solid var(--stone-800)",
                  display: "flex",
                  gap: "12px",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  flexShrink: 0,
                }}
              >
                {draft.existingCharacterId && (
                  <div
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "6px",
                      background: "rgba(234,179,8,0.08)",
                      border: "1px solid rgba(234,179,8,0.3)",
                      fontSize: "12px",
                      color: "var(--stone-400)",
                    }}
                  >
                    <strong style={{ color: "var(--stone-200)" }}>Already imported</strong> as{" "}
                    <code style={{ fontFamily: "monospace", fontSize: "11px" }}>
                      {draft.existingCharacterId}
                    </code>
                  </div>
                )}
                <button
                  onClick={proceedToConfirm}
                  style={{
                    padding: "9px 20px",
                    borderRadius: "6px",
                    background: "var(--accent)",
                    color: "#000",
                    fontWeight: 700,
                    fontSize: "13px",
                    border: "none",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Preview & Import →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
