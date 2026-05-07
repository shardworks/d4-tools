/**
 * /import/error — Full-page error display for OAuth / CSRF failures (D21).
 *
 * Used for: CSRF state mismatch, OAuth denial, token exchange failure.
 * Per visual-spec §9.14: CSRF/state mismatch → full-page error channel.
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: "24px",
        textAlign: "center",
        maxWidth: "520px",
        margin: "0 auto",
      }}
    >
      {/* Error icon */}
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: "rgba(239,68,68,0.12)",
          border: "1px solid rgba(239,68,68,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "24px",
          marginBottom: "20px",
        }}
      >
        ✕
      </div>

      <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--stone-100)", margin: "0 0 12px 0" }}>
        {isCSRF ? "Security Error" : "Sign-in Failed"}
      </h1>

      <p style={{ fontSize: "14px", color: "var(--stone-400)", lineHeight: 1.6, margin: "0 0 28px 0" }}>
        {message}
      </p>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
        <a
          href="/api/auth/battlenet/start"
          style={{
            padding: "8px 18px",
            borderRadius: "6px",
            background: "var(--accent)",
            color: "#000",
            fontSize: "13px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Try Again
        </a>
        <Link
          href="/characters/new"
          style={{
            padding: "8px 18px",
            borderRadius: "6px",
            background: "transparent",
            border: "1px solid var(--stone-700)",
            color: "var(--stone-300)",
            fontSize: "13px",
            fontWeight: 500,
            textDecoration: "none",
          }}
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
