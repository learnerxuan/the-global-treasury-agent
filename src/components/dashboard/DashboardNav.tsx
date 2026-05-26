"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/invoices", label: "Invoices" },
  { href: "/bank-statements", label: "Bank Statements" },
  { href: "/payments", label: "Payments" },
  { href: "/results", label: "Results" },
  { href: "/rejected", label: "Rejected" },
  { href: "/settings", label: "Settings" }
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="dashboard-nav" aria-label="Dashboard sections">
      {NAV_ITEMS.map((item) => (
        <Link className={`dashboard-tab ${pathname === item.href ? "active" : ""}`} href={item.href} key={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
