"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Activity", exact: true },
  { href: "/admin/traces", label: "Live traces" },
] as const;

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav className="admin-tabs" aria-label="Admin sections">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? "admin-tab admin-tab--active" : "admin-tab"}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
