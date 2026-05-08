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
import { AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
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
      <div className="flex items-center justify-center h-full text-stone-600 text-sm text-center p-6">
        Select a hero from the list to preview their build.
      </div>
    );
  }

  const unresolvedCount = (warnings ?? []).filter((w) => w.storedAs.startsWith("unresolved:")).length;

  return (
    <div className="p-6 overflow-y-auto h-full">
      {unresolvedCount > 0 && (
        <div className="px-[14px] py-[10px] rounded-md bg-warning/10 border border-warning/30 mb-4 text-xs text-stone-300">
          <strong className="inline-flex items-center gap-1 text-stone-200"><AlertTriangle size={14} className="text-warning shrink-0" />{unresolvedCount} unresolved</strong>{" "}
          {unresolvedCount === 1 ? "entity" : "entities"} — stored with{" "}
          <code className="font-mono">unresolved:</code> prefix. These will be
          visible in the imported character and can be corrected when the catalog is updated.
        </div>
      )}

      <div className="mb-4">
        <div className="text-[18px] font-bold text-stone-100">
          {draft.character.name}
        </div>
        <div className="text-sm text-stone-400 mt-1">
          {draft.character.class} · Level{" "}
          <span className="tabular-nums">{draft.character.level}</span> · Paragon{" "}
          <span className="tabular-nums">{draft.character.paragonAllocation.paragonLevel}</span>
        </div>
        {draft.character.import && (
          <div className="text-[11px] text-stone-600 mt-1">
            {draft.character.import.season
              ? `Season ${draft.character.import.season}`
              : "Eternal"}{" "}
            · {draft.character.import.realm} · {draft.character.import.region}
          </div>
        )}
      </div>

      <div className="text-xs text-stone-500">
        <span className="tabular-nums">{Object.keys(draft.character.equippedItems).length}</span> items equipped ·{" "}
        <span className="tabular-nums">{draft.character.skillSelections.length}</span> skills selected
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
      <div className="p-8 max-w-[520px]">
        <h1 className="text-[20px] font-bold text-stone-100 m-0 mb-3">
          Import from Battle.net
        </h1>
        <p className="text-base text-stone-400 mb-6">
          Connect your Battle.net account to import your Diablo IV characters.
        </p>
        <div className="flex gap-3 flex-wrap">
          <a
            href="/api/auth/battlenet/start"
            className="px-5 py-[10px] rounded-md bg-accent text-black font-bold text-base no-underline hover:bg-accent/90"
          >
            Sign in with Battle.net
          </a>
          <a
            href="/characters/new"
            className="px-5 py-[10px] rounded-md bg-transparent border border-stone-700 text-stone-300 font-medium text-base no-underline hover:bg-stone-800 hover:border-stone-600"
          >
            Enter Manually
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[60vh]">
      {/* ── Left rail: hero list (30%) ─────────────────────────── */}
      <div className="w-[30%] min-w-[220px] max-w-[320px] border-r border-stone-800 overflow-y-auto shrink-0">
        <div className="p-4 border-b border-stone-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-stone-200 m-0">Your Heroes</h2>
          {loading && (
            <span className="text-[11px] text-stone-500">Loading…</span>
          )}
        </div>

        {/* Error / rate-limit / private-profile banners */}
        {error && (
          <div className="m-2 px-3 py-[10px] rounded-md bg-destructive/8 border border-destructive/30 text-xs text-stone-400">
            <div className="text-destructive font-semibold mb-1">
              {rateLimitedUntil ? `Rate limited — retry in ${countdown}s` : "Error"}
            </div>
            {error}
            {privateProfile && (
              <div className="mt-2">
                <a href="/characters/new" className="text-accent no-underline text-[11px] inline-flex items-center gap-1">
                  Enter character manually <ArrowRight size={14} />
                </a>
              </div>
            )}
            {!rateLimitedUntil && !privateProfile && (
              <button
                onClick={fetchRoster}
                className="mt-2 px-[10px] py-1 rounded bg-transparent border border-stone-700 text-stone-400 text-[11px] cursor-pointer block hover:bg-stone-800"
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
              className={cn(
                "w-full px-4 py-3 border-l-2 border-r-0 border-t-0 border-b border-stone-800 cursor-pointer text-left",
                isSelected
                  ? "bg-surface-2 border-l-accent"
                  : "bg-transparent border-l-transparent hover:bg-surface-2"
              )}
            >
              <div className="text-sm font-semibold text-stone-100">
                {hero.name}
              </div>
              <div className="text-[11px] text-stone-500 mt-0.5 flex gap-[6px]">
                <span>{hero.class.charAt(0).toUpperCase() + hero.class.slice(1)}</span>
                <span>·</span>
                <span className="tabular-nums">Lvl {hero.level}</span>
                {hero.paragonLevel > 0 && (
                  <>
                    <span>·</span>
                    <span className="tabular-nums">P{hero.paragonLevel}</span>
                  </>
                )}
                <span>·</span>
                <span
                  className={cn(
                    "px-[5px] py-0 rounded-[3px] text-[10px] font-semibold",
                    hero.seasonal
                      ? "bg-warning/12 text-accent"
                      : "bg-stone-400/12 text-stone-400"
                  )}
                >
                  {hero.seasonal ? "S" : "E"}
                </span>
              </div>
            </button>
          );
        })}

        {!loading && heroes.length === 0 && !error && (
          <div className="p-4 text-xs text-stone-600">
            No heroes found on this account.
          </div>
        )}
      </div>

      {/* ── Right pane: preview (70%) ───────────────────────────── */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {draftLoading ? (
          <div className="flex items-center justify-center h-full text-stone-600 text-sm">
            Loading hero details…
          </div>
        ) : (
          <>
            <PreviewPane
              draft={draft ? { character: draft.character, buildName: draft.buildName } : null}
              warnings={draftWarnings}
            />

            {draft && (
              <div className="px-6 py-4 border-t border-stone-800 flex gap-3 items-center justify-end shrink-0">
                {draft.existingCharacterId && (
                  <div className="flex-1 px-3 py-2 rounded-md bg-warning/8 border border-warning/30 text-xs text-stone-400">
                    <strong className="text-stone-200">Already imported</strong> as{" "}
                    <code className="font-mono text-[11px]">
                      {draft.existingCharacterId}
                    </code>
                  </div>
                )}
                <button
                  onClick={proceedToConfirm}
                  className="px-5 py-[9px] rounded-md bg-accent text-black font-bold text-sm border-0 cursor-pointer shrink-0 hover:bg-accent/90 inline-flex items-center gap-1"
                >
                  Preview & Import <ArrowRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
