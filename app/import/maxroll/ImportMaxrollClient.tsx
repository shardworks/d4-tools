"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Download, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import type { VariantResult } from "@/lib/import/maxroll/types";

// ── State machine ─────────────────────────────────────────────────────────────

type FlowState =
  | { phase: "paste" }
  | { phase: "loading" }
  | { phase: "preview"; plannerId: string; variants: VariantResult[]; selectedIndex: number }
  | { phase: "confirm"; plannerId: string; variant: VariantResult }
  | { phase: "committing" }
  | { phase: "error"; message: string };

// ── Component ─────────────────────────────────────────────────────────────────

export function ImportMaxrollClient() {
  const router = useRouter();
  const [state, setState] = useState<FlowState>({ phase: "paste" });
  const [input, setInput] = useState("");

  // ── Paste → Loading → Preview ─────────────────────────────────────────────

  async function handleImport() {
    if (!input.trim()) return;
    setState({ phase: "loading" });

    try {
      const res = await fetch("/api/import/maxroll/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      });

      const data = await res.json() as
        | { plannerId: string; variants: VariantResult[] }
        | { error: string; reason?: string };

      if (!res.ok || "error" in data) {
        setState({
          phase: "error",
          message: "error" in data ? data.error : `HTTP ${res.status}`,
        });
        return;
      }

      if (!data.variants || data.variants.length === 0) {
        setState({ phase: "error", message: "No variants found in this planner." });
        return;
      }

      setState({
        phase: "preview",
        plannerId: data.plannerId,
        variants: data.variants,
        selectedIndex: 0,
      });
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  // ── Preview → Confirm ─────────────────────────────────────────────────────

  function handleSelectVariant(index: number) {
    if (state.phase !== "preview") return;
    setState({ ...state, selectedIndex: index });
  }

  function handleConfirm() {
    if (state.phase !== "preview") return;
    const variant = state.variants[state.selectedIndex];
    setState({ phase: "confirm", plannerId: state.plannerId, variant });
  }

  // ── Confirm → Committing → /builds/<id> ───────────────────────────────────

  async function handleCommit() {
    if (state.phase !== "confirm") return;
    setState({ phase: "committing" });

    const { variant } = state;

    // Build the request body: character data + importedFrom for the build (D19/D23)
    const body = {
      ...variant.character,
      importedFrom: variant.build.importedFrom,
    };

    try {
      const res = await fetch("/api/characters?withDefaultBuild=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json() as { build?: { id: string }; error?: string };
      if (!res.ok || !data.build) {
        setState({
          phase: "error",
          message: data.error ?? `Failed to create character (HTTP ${res.status})`,
        });
        return;
      }

      // Navigate to the new build — setActiveBuildId is called server-side on visit
      router.push(`/builds/${data.build.id}`);
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  function handleBack() {
    if (state.phase === "confirm" && "plannerId" in state) {
      // Return to preview
      // We need the variants — go back to paste since we don't have them here
      setState({ phase: "paste" });
    } else {
      setState({ phase: "paste" });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-[720px]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {state.phase !== "paste" && state.phase !== "loading" && state.phase !== "committing" && (
          <button
            onClick={handleBack}
            className="text-stone-400 hover:text-stone-200 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <h1 className="text-[20px] font-bold text-stone-100 m-0">
          Import from Maxroll Planner
        </h1>
      </div>

      {/* ── Phase: paste ── */}
      {state.phase === "paste" && (
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">
            Paste a Maxroll planner URL, build-guide URL, or bare planner ID to import a build.
          </p>
          <div className="flex gap-2">
            <Input
              className="flex-1 font-mono text-sm"
              placeholder="https://maxroll.gg/d4/planner/abc12345  or  abc12345"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleImport(); }}
              autoFocus
            />
            <Button onClick={() => void handleImport()} disabled={!input.trim()}>
              <Download size={14} className="mr-1.5" />
              Import
            </Button>
          </div>
          <p className="text-stone-600 text-xs">
            Accepted formats: planner URL · planner URL with variant hash (#0&equipment) ·
            build-guide URL · bare planner ID
          </p>
        </div>
      )}

      {/* ── Phase: loading ── */}
      {state.phase === "loading" && (
        <div className="flex items-center gap-3 text-stone-400 py-8">
          <Loader2 size={20} className="animate-spin" />
          <span>Fetching planner data…</span>
        </div>
      )}

      {/* ── Phase: preview ── */}
      {state.phase === "preview" && (
        <div className="space-y-5">
          {/* Variant picker */}
          {state.variants.length > 1 && (
            <div className="space-y-2">
              <p className="text-xs text-stone-500 font-semibold uppercase tracking-wider">
                Variants ({state.variants.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {state.variants.map((v, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectVariant(i)}
                    className={[
                      "px-3 py-1.5 rounded text-sm border transition-colors",
                      state.selectedIndex === i
                        ? "border-amber-500 bg-amber-500/10 text-amber-300"
                        : "border-stone-700 bg-stone-800/60 text-stone-400 hover:border-stone-500",
                    ].join(" ")}
                  >
                    {v.variantName ?? `Variant ${i + 1}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected variant summary */}
          {(() => {
            const v = state.variants[state.selectedIndex];
            const charClass = v.character.class;
            const level = v.character.level;
            const paragonLevel = v.character.paragonAllocation.paragonLevel;
            const itemCount = Object.keys(v.items).length;
            const report = v.report;
            const totalUnmapped =
              report.unmappedAffixes.length +
              report.unmappedAspects.length +
              report.unmappedSkills.length +
              report.unmappedGlyphs.length;

            return (
              <div className="space-y-4">
                {/* Character overview */}
                <div className="bg-surface-2 border border-stone-800 rounded-md p-4">
                  <h2 className="text-sm font-semibold text-stone-200 mb-2">
                    {v.variantName ?? v.character.name}
                  </h2>
                  <div className="flex gap-4 text-xs text-stone-400">
                    <span>Class: <span className="text-stone-200">{charClass}</span></span>
                    <span>Level: <span className="text-stone-200">{level}</span></span>
                    <span>Paragon: <span className="text-stone-200">{paragonLevel}</span></span>
                    <span>Items: <span className="text-stone-200">{itemCount}</span></span>
                  </div>
                </div>

                {/* Version mismatch warning */}
                {report.versionMismatch && (
                  <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-800/60 rounded p-3 text-sm text-amber-300">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <span>
                      Patch mismatch: catalog is at{" "}
                      <code className="font-mono">{report.versionMismatch.catalogPatch}</code>{" "}
                      but planner reports{" "}
                      <code className="font-mono">{report.versionMismatch.plannerVersion}</code>.{" "}
                      {Math.round(report.versionMismatch.explicitMappedRatio * 100)}% of affixes
                      mapped — some items may be incomplete.
                    </span>
                  </div>
                )}

                {/* Unmapped reference summary */}
                {totalUnmapped > 0 && (
                  <div className="bg-stone-800/40 border border-stone-700 rounded p-3 text-xs text-stone-400 space-y-1">
                    <p className="font-semibold text-stone-300">
                      {totalUnmapped} unmapped reference{totalUnmapped !== 1 ? "s" : ""}
                    </p>
                    {report.unmappedAffixes.length > 0 && (
                      <p>Affixes: {report.unmappedAffixes.length} not found in catalog</p>
                    )}
                    {report.unmappedAspects.length > 0 && (
                      <p>Aspects: {report.unmappedAspects.length} not found in catalog</p>
                    )}
                    {report.unmappedSkills.length > 0 && (
                      <p>Skills: {report.unmappedSkills.length} not found in catalog</p>
                    )}
                    {report.unmappedGlyphs.length > 0 && (
                      <p>Glyphs: {report.unmappedGlyphs.length} not found in catalog</p>
                    )}
                  </div>
                )}

                {/* Gear slot list */}
                {itemCount > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-stone-500 font-semibold uppercase tracking-wider mb-2">
                      Gear ({itemCount} slots)
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(v.items).map(([slot, item]) => (
                        <div
                          key={slot}
                          className="bg-stone-800/40 border border-stone-800 rounded px-3 py-2 text-xs"
                        >
                          <span className="text-stone-500 uppercase tracking-wider text-[10px]">
                            {slot}
                          </span>
                          <p className="text-stone-200 truncate mt-0.5">
                            {item.name || "(unnamed)"}
                          </p>
                          <p className="text-stone-500 mt-0.5">
                            {item.rarity}
                            {item.itemPower !== undefined ? ` · IP ${item.itemPower}` : ""}
                            {item.explicits.length > 0
                              ? ` · ${item.explicits.length} affixes`
                              : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Action */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleConfirm}>
              Continue to Confirm
            </Button>
            <Button variant="outline" onClick={() => setState({ phase: "paste" })}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Phase: confirm ── */}
      {state.phase === "confirm" && (
        <div className="space-y-5">
          <div className="bg-surface-2 border border-stone-700 rounded-md p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={18} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-stone-200">Ready to import</h2>
            </div>
            <div className="text-sm text-stone-400 space-y-1">
              <p>
                <span className="text-stone-300">{state.variant.character.name}</span> ·{" "}
                {state.variant.character.class} · Lvl {state.variant.character.level}
              </p>
              <p>
                {Object.keys(state.variant.items).length} gear slots ·{" "}
                {state.variant.character.skillSelections.length} skills ·{" "}
                {state.variant.character.paragonAllocation.boards.length} paragon boards
              </p>
            </div>
          </div>
          <p className="text-xs text-stone-500">
            This will create a new character and default build. You can edit either after import.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => void handleCommit()}>
              Import Build
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                // Go back to preview — need to re-fetch; simplest is to go to paste
                setState({ phase: "paste" });
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Phase: committing ── */}
      {state.phase === "committing" && (
        <div className="flex items-center gap-3 text-stone-400 py-8">
          <Loader2 size={20} className="animate-spin" />
          <span>Creating character and build…</span>
        </div>
      )}

      {/* ── Phase: error ── */}
      {state.phase === "error" && (
        <div className="space-y-4">
          <div className="bg-red-900/20 border border-red-800/60 rounded p-4 text-sm text-red-300">
            <p className="font-semibold mb-1">Import failed</p>
            <p className="font-mono text-xs">{state.message}</p>
          </div>
          <Button variant="outline" onClick={() => setState({ phase: "paste" })}>
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}
