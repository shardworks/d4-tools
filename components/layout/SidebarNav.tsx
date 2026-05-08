"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sword, User, ChevronLeft, ChevronRight, CloudDownload, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    href: "/builds",
    label: "Builds",
    icon: Sword,
  },
  {
    href: "/characters/new",
    label: "New Character",
    icon: User,
  },
  {
    href: "/import",
    label: "Import from Battle.net",
    icon: CloudDownload,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
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
    return <div className="w-10 min-w-10 shrink-0" />;
  }

  return (
    <aside
      className="flex flex-col overflow-hidden bg-surface-1 border-r border-stone-800 transition-[width] duration-150 ease-in-out shrink-0"
      style={{ width, minWidth: width }}
    >
      <nav className="flex-1 py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-[10px] px-2 h-10 no-underline text-sm whitespace-nowrap overflow-hidden border-l-2 transition-[color,background-color] duration-100 ease-in-out",
                isActive
                  ? "text-accent bg-surface-2 border-l-accent"
                  : "text-stone-400 bg-transparent border-l-transparent hover:bg-surface-2 hover:text-stone-300"
              )}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={toggleCollapsed}
        className="flex items-center justify-center h-10 w-full bg-transparent border-0 border-t border-stone-800 cursor-pointer text-stone-500 hover:bg-surface-2 hover:text-stone-300"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}
