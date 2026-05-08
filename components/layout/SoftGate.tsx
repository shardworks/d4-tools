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
      className="fixed inset-0 z-[9999] flex-col items-center justify-center p-6 text-center gap-4"
      style={{ backgroundColor: "rgba(12, 10, 9, 0.95)" }}
    >
      <p className="text-stone-300 text-base max-w-[400px] leading-[1.6]">
        This tool is designed for desktop. Some features may not work as
        expected on smaller screens.
      </p>
      <button
        onClick={handleDismiss}
        className="px-4 py-2 bg-surface-2 border border-stone-700 rounded text-stone-200 text-sm cursor-pointer hover:bg-stone-800"
      >
        Continue anyway
      </button>
    </div>
  );
}
