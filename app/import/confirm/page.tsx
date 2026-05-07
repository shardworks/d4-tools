/**
 * /import/confirm — Import confirm screen (D18).
 *
 * Full-page rendering BuildSummaryView with a footer Save / Cancel bar.
 * Fetches the hero import draft from /api/blizzard/import/[heroId].
 * Re-import detection (D13): if existingId is provided, shows "Same hero already imported"
 * banner with "Save as new" / "Update existing" buttons.
 */

import { Suspense } from "react";
import { ImportConfirmClient } from "@/components/import/ImportConfirmClient";

export const metadata = { title: "Confirm Import — D4 Tools" };

export default function ImportConfirmPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: "24px", color: "var(--stone-500)", fontSize: "14px" }}>
          Loading preview…
        </div>
      }
    >
      <ImportConfirmClient />
    </Suspense>
  );
}
