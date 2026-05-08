/**
 * /import/error — Full-page error display for OAuth / CSRF failures (D21).
 *
 * Used for: CSRF state mismatch, OAuth denial, token exchange failure.
 * Per visual-spec §9.14: CSRF/state mismatch → full-page error channel.
 *
 * Note: emoji glyphs on lines 64 and 89-90 are out of scope per
 * foundation-audit-2026-05-08.md §3.2.
 */

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

const ERROR_MESSAGES: Record<string, string> = {
  csrf_mismatch:
    "Security check failed: the OAuth state parameter did not match. This can happen if you have multiple browser tabs open or if the session expired. Please try signing in again.",
  csrf_state_missing:
    "Security check failed: the OAuth state cookie was missing. This usually means the sign-in session expired. Please try again.",
  missing_code_or_state:
    "The Battle.net callback was missing required parameters. Please try signing in again.",
};

function ImportErrorContent() {
  const params = useSearchParams();
  const reason = params.get("reason") ?? "unknown";

  const message =
    ERROR_MESSAGES[reason] ??
    (reason.startsWith("http") || reason.includes("failed")
      ? `An error occurred during sign-in: ${decodeURIComponent(reason)}`
      : `Sign-in failed (${reason}). Please try again.`);

  const isCSRF = reason === "csrf_mismatch" || reason === "csrf_state_missing";

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center max-w-[520px] mx-auto">
      {/* Error icon */}
      <div className="w-12 h-12 rounded-full bg-destructive/12 border border-destructive/30 flex items-center justify-center text-2xl mb-5">
        ✕
      </div>

      <h1 className="text-[20px] font-bold text-stone-100 m-0 mb-3">
        {isCSRF ? "Security Error" : "Sign-in Failed"}
      </h1>

      <p className="text-base text-stone-400 leading-[1.6] m-0 mb-7">
        {message}
      </p>

      <div className="flex gap-3 flex-wrap justify-center">
        <a
          href="/api/auth/battlenet/start"
          className="px-[18px] py-2 rounded-md bg-accent text-black text-sm font-semibold no-underline"
        >
          Try Again
        </a>
        <Link
          href="/characters/new"
          className="px-[18px] py-2 rounded-md bg-transparent border border-stone-700 text-stone-300 text-sm font-medium no-underline"
        >
          Enter Manually
        </Link>
      </div>
    </div>
  );
}

export default function ImportErrorPage() {
  return (
    <Suspense>
      <ImportErrorContent />
    </Suspense>
  );
}
