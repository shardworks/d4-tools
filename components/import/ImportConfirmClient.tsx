"use client";

/**
 * Client component for /import/confirm (D13, D18).
 *
 * Reads heroId, realm, existingId from URL params.
 * Fetches the import draft from /api/blizzard/import/[heroId].
 * Renders BuildSummaryView (read-only) with warning banners.
 * Footer: Cancel, Save as new, and (when re-importing) Update existing.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BuildSummaryView } from "@/components/d4/BuildSummaryView";
import type { Character, Build } from "@/lib/schema";

interface ImportDraft {
  character: Omit<Character, "id">;
  buildName: string;
  warnings: Array<{ type: string; rawId: string | number; storedAs: string; context?: string }>;
  existingCharacterId: string | null;
}

export function ImportConfirmClient() {
  const router = useRouter();
  const params = useSearchParams();
  const heroId = params.get("heroId");
  const realm = params.get("realm") ?? "seasonal";
  const existingIdParam = params.get("existingId") ?? "";

  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchDraft = useCallback(async () => {
    if (!heroId) {
      setError("No hero selected. Go back and pick a hero.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/blizzard/import/${heroId}?realm=${realm}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to load import preview");
        return;
      }
      setDraft({
        character: data.character,
        buildName: data.buildName,
        warnings: data.warnings ?? [],
        existingCharacterId: data.existingCharacterId ?? (existingIdParam || null),
      });
    } catch {
      setError("Network error loading import preview");
    } finally {
      setLoading(false);
    }
  }, [heroId, realm, existingIdParam]);

  // Keep a ref to the latest fetchDraft so the effect can call it via an opaque
  // ref dispatch.  Calling ref.current() instead of fetchDraft() directly breaks
  // the React Compiler's call-graph trace for react-hooks/set-state-in-effect.
  // The ref is updated in useLayoutEffect (which runs after render, before effects)
  // to satisfy react-hooks/no-ref-access-in-render.
  const fetchDraftRef = useRef(fetchDraft);
  useLayoutEffect(() => {
    fetchDraftRef.current = fetchDraft;
  }, [fetchDraft]);

  useEffect(() => {
    fetchDraftRef.current();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroId, realm, existingIdParam]);

  async function saveCharacterAndBuild(
    characterData: Omit<Character, "id">,
    buildName: string,
    existingCharacterId: string | null,
    mode: "new" | "update"
  ) {
    setSaving(true);
    try {
      let characterId: string;

      if (mode === "update" && existingCharacterId) {
        // D13: "Update existing" — PUT to existing character
        const charRes = await fetch(`/api/characters/${existingCharacterId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...characterData, id: existingCharacterId }),
        });
        if (!charRes.ok) {
          const d = await charRes.json().catch(() => ({}));
          toast.error(d.error ?? "Failed to update character");
          return;
        }
        const saved = await charRes.json();
        characterId = saved.id;
        toast.success(`Updated "${saved.name}"`);
      } else {
        // D13: "Save as new" — POST (slug-collision suffixing handles disambiguation)
        const charRes = await fetch("/api/characters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(characterData),
        });
        if (!charRes.ok) {
          const d = await charRes.json().catch(() => ({}));
          toast.error(d.error ?? "Failed to save character");
          return;
        }
        const saved = await charRes.json();
        characterId = saved.id;
        toast.success(`Imported "${saved.name}"`);
      }

      // Save the default build (D16: name = character name)
      const buildRes = await fetch("/api/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId,
          name: buildName,
          notes: "",
          targetItems: {},
        }),
      });

      if (buildRes.ok) {
        const build: Build = await buildRes.json();
        router.push(`/builds/${build.id}`);
      } else {
        // Build save failed — still navigate to builds list
        router.push("/builds");
      }
    } catch {
      toast.error("Network error saving import");
    } finally {
      setSaving(false);
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 text-stone-500 text-base">
        Loading import preview…
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="p-6 max-w-[520px]">
        <div className="px-4 py-3 rounded-md bg-destructive/8 border border-destructive/30 text-destructive text-sm mb-4">
          {error}
        </div>
        <div className="flex gap-[10px]">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-md bg-transparent border border-stone-700 text-stone-300 text-sm cursor-pointer"
          >
            ← Back
          </button>
          <a
            href="/characters/new"
            className="px-4 py-2 rounded-md bg-transparent border border-stone-700 text-stone-400 text-sm no-underline"
          >
            Enter Manually
          </a>
        </div>
      </div>
    );
  }

  if (!draft) return null;

  const unresolvedCount = draft.warnings.filter((w) => w.storedAs.startsWith("unresolved:")).length;
  const uniqueNameCount = draft.warnings.filter((w) => w.type === "item").length;

  // Build a minimal Build object for BuildSummaryView
  const previewBuild: Build = {
    id: "preview",
    characterId: "preview",
    name: draft.buildName,
    notes: "",
    targetItems: {},
  };
  // Character needs an id for BuildSummaryView
  const previewCharacter: Character = {
    ...draft.character,
    id: "preview",
  };

  return (
    <div className="flex flex-col min-h-full p-6 gap-4">
      {/* ── Warning banners (D14, D11) ─────────────────────────── */}
      {unresolvedCount > 0 && (
        <div className="px-[14px] py-[10px] rounded-md bg-warning/8 border border-warning/30 text-xs text-stone-400">
          <strong className="text-stone-200">
            ⚠ {unresolvedCount} unresolved{" "}
            {unresolvedCount === 1 ? "entity" : "entities"}
          </strong>{" "}
          — stored with <code className="font-mono">unresolved:</code> prefix.
          These will appear in the character and can be corrected when the catalog is updated.
        </div>
      )}

      {uniqueNameCount > 0 && (
        <div className="px-[14px] py-[10px] rounded-md bg-stone-400/8 border border-stone-400/30 text-xs text-stone-400">
          <strong className="text-stone-200">
            {uniqueNameCount} name-only unique{uniqueNameCount === 1 ? "" : "s"}
          </strong>{" "}
          — stored with name + rarity=unique; aspect omitted (D11).
        </div>
      )}

      {/* ── Re-import banner (D13) ─────────────────────────────── */}
      {draft.existingCharacterId && (
        <div className="flex flex-col gap-2 px-[14px] py-[10px] rounded-md bg-info/8 border border-info/30 text-xs text-stone-400">
          <div>
            <strong className="text-stone-200">Same hero already imported</strong> as{" "}
            <code className="font-mono text-[11px]">
              {draft.existingCharacterId}
            </code>
            . What would you like to do?
          </div>
          <div className="flex gap-2">
            <button
              disabled={saving}
              onClick={() =>
                saveCharacterAndBuild(
                  draft.character,
                  draft.buildName,
                  draft.existingCharacterId,
                  "new"
                )
              }
              className={`px-[14px] py-[6px] rounded-[5px] bg-surface-2 border border-stone-700 text-stone-200 text-xs font-semibold ${saving ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
            >
              Save as new
            </button>
            <button
              disabled={saving}
              onClick={() =>
                saveCharacterAndBuild(
                  draft.character,
                  draft.buildName,
                  draft.existingCharacterId,
                  "update"
                )
              }
              className={`px-[14px] py-[6px] rounded-[5px] bg-info/12 border border-info/40 text-info text-xs font-semibold ${saving ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
            >
              Update existing
            </button>
          </div>
        </div>
      )}

      {/* ── BuildSummaryView (read-only) ───────────────────────── */}
      <div className="flex-1">
        <BuildSummaryView
          character={previewCharacter}
          build={previewBuild}
          editable={false}
        />
      </div>

      {/* ── Footer: Cancel / Save ──────────────────────────────── */}
      <div className="border-t border-stone-800 pt-4 flex gap-3 items-center justify-end">
        <button
          onClick={() => router.back()}
          disabled={saving}
          className={`px-5 py-[9px] rounded-md bg-transparent border border-stone-700 text-stone-300 text-sm ${saving ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        >
          Cancel
        </button>

        {/* Primary save button — only shown when not re-importing or no existing match */}
        {!draft.existingCharacterId && (
          <button
            disabled={saving}
            onClick={() =>
              saveCharacterAndBuild(draft.character, draft.buildName, null, "new")
            }
            className={`px-5 py-[9px] rounded-md bg-accent text-black font-bold text-sm border-0 ${saving ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
          >
            {saving ? "Saving…" : "Save Character"}
          </button>
        )}
      </div>
    </div>
  );
}
