/**
 * /import — Battle.net character roster picker (D17).
 *
 * List-detail layout (30/70 split per visual-spec §15):
 *   Left rail (30%): hero list — Name, Class, Level, Realm (Seasonal/Eternal)
 *   Right pane (70%): BuildSummaryView preview of the selected hero (post detail-fetch)
 *
 * If no region is set, redirects to /settings.
 * If not signed in (no tokens), shows a sign-in prompt.
 */

import { redirect } from "next/navigation";
import { loadSettings } from "@/lib/persistence/settings";
import { loadTokens } from "@/lib/blizzard/tokens";
import { ImportRosterClient } from "@/components/import/ImportRosterClient";

export const metadata = { title: "Import from Battle.net — D4 Tools" };

export default async function ImportPage() {
  const [settings, tokens] = await Promise.all([
    loadSettings().catch(() => ({})),
    loadTokens().catch(() => null),
  ]);

  // If no tokens: show sign-in prompt (ImportRosterClient handles this state)
  // If no region: redirect to settings so the user picks one first
  const region = (settings as { region?: string }).region;
  const isConnected = tokens !== null;

  if (isConnected && !region) {
    redirect("/settings#region");
  }

  return <ImportRosterClient isConnected={isConnected} />;
}
