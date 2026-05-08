import { Suspense } from "react";
import * as fs from "fs/promises";
import * as path from "path";
import { Key } from "lucide-react";
import { getScreenshotDir } from "@/lib/persistence/paths";
import { getActiveBuildId } from "@/lib/persistence/active-build";
import { loadBuild } from "@/lib/persistence/builds";
import { loadCharacter } from "@/lib/persistence/characters";
import { sha256 } from "@/lib/triage/hash";
import { SUPPORTED_IMAGE_TYPES } from "@/lib/triage/types";
import type { ScreenshotEntry } from "@/lib/triage/types";
import { TriageWorkspaceClient } from "./TriageWorkspaceClient";

const SUPPORTED_EXTS = new Set(Object.keys(SUPPORTED_IMAGE_TYPES));

export const metadata = { title: "Triage — D4 Tools" };

// ─── Empty state cards (D29) ─────────────────────────────────────────────

function EmptyState({
  heading,
  description,
  action,
}: {
  heading: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-3 p-8">
      <Key size={28} className="text-stone-600" />
      <div className="text-sm font-medium text-stone-400">{heading}</div>
      <div className="text-xs text-stone-600 text-center max-w-xs">{description}</div>
      {action}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default async function TriagePage() {
  // Check ANTHROPIC_API_KEY (must be set for parsing)
  if (!process.env.ANTHROPIC_API_KEY) {
    return (
      <EmptyState
        heading="Anthropic API key not configured"
        description="Set the ANTHROPIC_API_KEY environment variable to enable screenshot parsing. Restart the server after setting it."
      />
    );
  }

  // Check SCREENSHOT_DIR
  let screenshotDir: string;
  try {
    screenshotDir = getScreenshotDir();
  } catch {
    return (
      <EmptyState
        heading="Screenshot directory not configured"
        description="Set the SCREENSHOT_DIR environment variable to the folder containing your D4 loot screenshots. Restart the server after setting it."
      />
    );
  }

  // Load screenshots
  let screenshots: ScreenshotEntry[] = [];
  try {
    const entries = await fs.readdir(screenshotDir, { withFileTypes: true });
    const imageFiles = entries.filter((e) => {
      if (!e.isFile()) return false;
      const ext = path.extname(e.name).toLowerCase();
      return SUPPORTED_EXTS.has(ext);
    });

    for (const file of imageFiles) {
      const filePath = path.join(screenshotDir, file.name);
      try {
        const [stat, bytes] = await Promise.all([
          fs.stat(filePath),
          fs.readFile(filePath),
        ]);
        screenshots.push({
          filename: file.name,
          mtimeMs: stat.mtimeMs,
          hash: sha256(bytes),
        });
      } catch {
        // Skip unreadable files
      }
    }
    screenshots.sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return (
      <EmptyState
        heading="Cannot read screenshot directory"
        description={`Could not read ${screenshotDir}. Check that the directory exists and the app has read access.`}
      />
    );
  }

  // Load active build and character
  let activeBuild = null;
  let activeCharacter = null;
  try {
    const buildId = await getActiveBuildId();
    if (buildId) {
      activeBuild = await loadBuild(buildId).catch(() => null);
      if (activeBuild) {
        activeCharacter = await loadCharacter(activeBuild.characterId).catch(() => null);
      }
    }
  } catch {
    // No active build — show empty state in detail pane
  }

  // Empty screenshots state is handled client-side in GalleryPane

  return (
    <Suspense>
      <TriageWorkspaceClient
        initialScreenshots={screenshots}
        initialCharacter={activeCharacter}
        initialBuild={activeBuild}
      />
    </Suspense>
  );
}
