"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sword, ChevronLeft, ChevronRight } from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/character/demo",
    label: "View Character",
    icon: Sword,
  },
];

const STORAGE_KEY = "d4-sidebar-collapsed";

export function SidebarNav() {
  // Initialize state lazily after mount to read localStorage (avoids SSR mismatch)
  const [collapsed, setCollapsed] = useState(true);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const stored = localStorage.getItem(STORAGE_KEY);
    const initialCollapsed = stored !== null ? stored === "true" : true;
    // Use a callback to batch the two state updates and avoid double render
    setCollapsed(initialCollapsed);
    setMounted(true);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  const width = collapsed ? "40px" : "200px";

  if (!mounted) {
    return <div style={{ width: "40px", minWidth: "40px", flexShrink: 0 }} />;
  }

  return (
    <aside
      style={{
        width,
        minWidth: width,
        flexShrink: 0,
        backgroundColor: "var(--surface-1)",
        borderRight: "1px solid var(--stone-800)",
        display: "flex",
        flexDirection: "column",
        transition: "width 150ms ease",
        overflow: "hidden",
      }}
    >
      <nav style={{ flex: 1, padding: "8px 0" }}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "0 8px",
                height: "40px",
                textDecoration: "none",
                color: isActive ? "var(--accent)" : "var(--stone-400)",
                backgroundColor: isActive ? "var(--surface-2)" : "transparent",
                borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                fontSize: "13px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                transition: "color 100ms ease, background-color 100ms ease",
              }}
            >
              <Icon
                size={18}
                style={{ flexShrink: 0 }}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={toggleCollapsed}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "40px",
          width: "100%",
          background: "none",
          border: "none",
          borderTop: "1px solid var(--stone-800)",
          cursor: "pointer",
          color: "var(--stone-500)",
        }}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}
