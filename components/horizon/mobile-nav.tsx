"use client";

import Link from "next/link";
import { Landmark, LayoutDashboard, Rows3, SendHorizonal } from "lucide-react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/my-banks", label: "Banks", icon: Landmark },
  { href: "/transaction-history", label: "History", icon: Rows3 },
  { href: "/transfer", label: "Transfer", icon: SendHorizonal }
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="grid grid-cols-4 gap-2 rounded-[28px] border border-border/70 bg-white/80 p-2 shadow-sm lg:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl px-3 py-3 text-xs font-medium transition-colors",
              active ? "bg-[#091c31] text-white" : "text-slate-600"
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
