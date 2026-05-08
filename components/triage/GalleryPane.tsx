"use client";

import { cn } from "@/lib/utils";
import { CheckCircle, Circle, AlertCircle, Loader2 } from "lucide-react";
import type { ScreenshotEntry, CacheEntry } from "@/lib/triage/types";

interface GalleryPaneProps {
  screenshots: ScreenshotEntry[];
  selectedFilename: string | null;
  cacheStatuses: Record<string, CacheEntry | null | "loading">;
  onSelect: (filename: string) => void;
}

/** Icon indicating parse-cache status for a thumbnail pip. */
function ParseStatusPip({
  status,
}: {
  status: CacheEntry | null | "loading" | undefined;
}) {
  if (status === "loading") {
    return <Loader2 size={14} className="text-stone-500 animate-spin" />;
  }
  if (status == null) {
    return <Circle size={14} className="text-stone-600" />;
  }
  if (status.kind === "no-item-detected") {
    return <Circle size={14} className="text-stone-500" />;
  }
  if (status.kind === "uncertain") {
    return <AlertCircle size={14} className="text-amber-400" />;
  }
  // item
  return <CheckCircle size={14} className="text-green-400" />;
}

/**
 * Gallery thumbnail grid sorted by mtime descending (D16).
 * Uses native img lazy-loading — no preprocessing, no thumbnail generation.
 * Parse-status pips driven by cache-lookup results.
 */
export function GalleryPane({
  screenshots,
  selectedFilename,
  cacheStatuses,
  onSelect,
}: GalleryPaneProps) {
  if (screenshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-6">
        <p className="text-stone-500 text-sm font-medium">No screenshots found</p>
        <p className="text-stone-600 text-xs text-center">
          Add JPG, PNG, WEBP, or GIF files to your SCREENSHOT_DIR directory.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 p-3 overflow-y-auto">
      {screenshots.map((entry) => {
        const isSelected = entry.filename === selectedFilename;
        const cacheStatus = cacheStatuses[entry.hash];

        return (
          <button
            key={entry.filename}
            type="button"
            onClick={() => onSelect(entry.filename)}
            className={cn(
              "relative rounded overflow-hidden border-2 transition-[border-color] duration-100 text-left bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              isSelected ? "border-accent" : "border-transparent hover:border-stone-600"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/triage/screenshots/${encodeURIComponent(entry.filename)}`}
              alt={entry.filename}
              loading="lazy"
              width={160}
              height={90}
              className="w-full object-cover aspect-video"
              style={{ objectFit: "cover" }}
            />
            {/* Parse-status pip */}
            <div className="absolute top-1 right-1 bg-stone-900/80 rounded-full p-0.5">
              <ParseStatusPip status={cacheStatus} />
            </div>
            {/* Filename label */}
            <div className="px-1.5 py-1 text-[10px] text-stone-500 truncate">
              {entry.filename}
            </div>
          </button>
        );
      })}
    </div>
  );
}
