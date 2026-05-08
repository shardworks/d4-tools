"use client";

import { useState, useEffect, useCallback } from "react";
import type { Character, Build } from "@/lib/schema";
import type { ScreenshotEntry, CacheEntry, ResolvedItem } from "@/lib/triage/types";
import { resolveItem } from "@/lib/triage/resolve";
import { GalleryPane } from "@/components/triage/GalleryPane";
import { DetailPane } from "@/components/triage/DetailPane";

interface TriageWorkspaceClientProps {
  /** Passed from Server Component — pre-loaded data */
  initialScreenshots: ScreenshotEntry[];
  initialCharacter: Character | null;
  initialBuild: Build | null;
}

/**
 * Two-pane triage workspace client.
 * Left: gallery thumbnail grid.
 * Right: detail pane (parse + compare + wear).
 */
export function TriageWorkspaceClient({
  initialScreenshots,
  initialCharacter,
  initialBuild,
}: TriageWorkspaceClientProps) {
  const [screenshots] = useState<ScreenshotEntry[]>(initialScreenshots);
  const [character, setCharacter] = useState<Character | null>(initialCharacter);
  const activeBuild = initialBuild;

  // Gallery selection
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);

  // Per-hash cache status (for pips)
  const [cacheStatuses, setCacheStatuses] = useState<
    Record<string, CacheEntry | null | "loading">
  >({});

  // Current parse result
  const [parseResult, setParseResult] = useState<{
    hash: string;
    entry: CacheEntry;
  } | null>(null);
  const [resolvedItems, setResolvedItems] = useState<ResolvedItem[] | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Prefetch cache status pips for visible screenshots
  useEffect(() => {
    for (const screenshot of screenshots) {
      const hash = screenshot.hash;
      if (cacheStatuses[hash] !== undefined) continue;

      setCacheStatuses((prev) => ({ ...prev, [hash]: "loading" }));
      fetch(`/api/triage/cache/${hash}`)
        .then(async (res) => {
          if (res.status === 404) {
            setCacheStatuses((prev) => ({ ...prev, [hash]: null }));
            return;
          }
          if (!res.ok) {
            setCacheStatuses((prev) => ({ ...prev, [hash]: null }));
            return;
          }
          const entry = (await res.json()) as CacheEntry;
          setCacheStatuses((prev) => ({ ...prev, [hash]: entry }));
        })
        .catch(() => {
          setCacheStatuses((prev) => ({ ...prev, [hash]: null }));
        });
    }
  }, [screenshots, cacheStatuses]);

  // When a thumbnail is selected, load cache status if available
  const handleSelectScreenshot = useCallback(
    (filename: string) => {
      setSelectedFilename(filename);
      setParseError(null);

      const screenshot = screenshots.find((s) => s.filename === filename);
      if (!screenshot) return;

      const cached = cacheStatuses[screenshot.hash];
      if (cached && cached !== "loading" && cached !== null) {
        // Pre-populate parse result from existing cache
        setParseResult({ hash: screenshot.hash, entry: cached });
        if (cached.kind === "item" && character) {
          setResolvedItems(
            cached.items.map((item) => resolveItem(item, character.class))
          );
        } else {
          setResolvedItems(null);
        }
      } else {
        setParseResult(null);
        setResolvedItems(null);
      }
    },
    [screenshots, cacheStatuses, character]
  );

  // Parse action
  const handleParse = useCallback(async () => {
    if (!selectedFilename) return;
    setIsParsing(true);
    setParseError(null);

    try {
      const res = await fetch("/api/triage/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: selectedFilename }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setParseError(err.error ?? "Parse failed");
        return;
      }

      const data = (await res.json()) as { hash: string; entry: CacheEntry };
      setParseResult(data);

      // Update cache pip
      setCacheStatuses((prev) => ({ ...prev, [data.hash]: data.entry }));

      // Resolve items
      if (data.entry.kind === "item" && character) {
        setResolvedItems(
          data.entry.items.map((item) => resolveItem(item, character.class))
        );
      } else {
        setResolvedItems(null);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setIsParsing(false);
    }
  }, [selectedFilename, character]);

  // Re-sync character after wear (router.refresh() in DetailPane triggers re-render)
  useEffect(() => {
    if (!initialCharacter) return;
    setCharacter(initialCharacter);
  }, [initialCharacter]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left pane — gallery */}
      <div className="w-[240px] min-w-[200px] shrink-0 border-r border-stone-800 overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-stone-800 text-[11px] text-stone-500 uppercase tracking-wider">
          Screenshots
        </div>
        <GalleryPane
          screenshots={screenshots}
          selectedFilename={selectedFilename}
          cacheStatuses={cacheStatuses}
          onSelect={handleSelectScreenshot}
        />
      </div>

      {/* Right pane — detail */}
      <div className="flex-1 overflow-hidden">
        <DetailPane
          filename={selectedFilename}
          parseResult={parseResult}
          resolvedItems={resolvedItems}
          character={character}
          activeBuild={activeBuild}
          isParsing={isParsing}
          parseError={parseError}
          onParse={handleParse}
        />
      </div>
    </div>
  );
}
