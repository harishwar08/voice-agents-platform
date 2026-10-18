"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SubNavItem = {
  label: string;
  href: string;
};

type SubNavProps = {
  items: readonly SubNavItem[];
};

export function SubNav({ items }: SubNavProps) {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex gap-1 overflow-x-auto border-b border-border pb-px">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard/business" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
              active
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
