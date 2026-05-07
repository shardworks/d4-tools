"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "d4-gate-dismissed";

export function SoftGate() {
  const [dismissed, setDismissed] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      // Batch the update outside of direct effect body using a microtask
      Promise.resolve().then(() => setDismissed(true));
    }
  }, []);

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div
      id="soft-gate"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(12, 10, 9, 0.95)",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
        gap: "16px",
      }}
    >
      <p
        style={{
          color: "var(--stone-300)",
          fontSize: "14px",
          maxWidth: "400px",
          lineHeight: 1.6,
        }}
      >
        This tool is designed for desktop. Some features may not work as
        expected on smaller screens.
      </p>
      <button
        onClick={handleDismiss}
        style={{
          padding: "8px 16px",
          backgroundColor: "var(--surface-2)",
          border: "1px solid var(--stone-700)",
          borderRadius: "var(--radius-card)",
          color: "var(--stone-200)",
          fontSize: "13px",
          cursor: "pointer",
        }}
      >
        Continue anyway
      </button>
    </div>
  );
}
