"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Projects", href: "/projects" },
  { name: "Time Tracking", href: "/time" },
  { name: "Invoices", href: "/invoices" },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {navigation.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.name}
            href={item.href}
            className={`
              block px-3 py-2 rounded-md text-sm font-medium transition-colors
              ${
                isActive
                  ? "bg-gray-900 text-white dark:bg-gray-700"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }
            `}
          >
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
