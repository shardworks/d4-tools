/**
 * /settings — Region picker and Battle.net connection status (D8, D20).
 *
 * Rendered as a single tall scrollable page with anchor links (visual-spec §15 settings archetype).
 * Sections:
 *   1. Region — Americas / Europe / Asia radio; persisted to DATA_DIR/settings.json
 *   2. Battle.net Connection — Sign in or Disconnect; status reflects token file existence
 */

import { loadSettings } from "@/lib/persistence/settings";
import { loadTokens } from "@/lib/blizzard/tokens";
import { SettingsPageClient } from "@/components/settings/SettingsPageClient";

export const metadata = { title: "Settings — D4 Tools" };

export default async function SettingsPage() {
  const [settings, tokens] = await Promise.all([
    loadSettings().catch(() => ({})),
    loadTokens().catch(() => null),
  ]);

  const isConnected = tokens !== null;
  const currentRegion = (settings as { region?: "americas" | "europe" | "asia" }).region ?? null;
  // Check server-side so the banner reflects the actual env state rather than a
  // client-side NEXT_PUBLIC_ var that is never set (would always evaluate falsy).
  const isBnetConfigured = !!(
    process.env.BLIZZARD_CLIENT_ID && process.env.BLIZZARD_CLIENT_SECRET
  );

  return (
    <SettingsPageClient
      initialRegion={currentRegion}
      initialIsConnected={isConnected}
      isBnetConfigured={isBnetConfigured}
    />
  );
}
