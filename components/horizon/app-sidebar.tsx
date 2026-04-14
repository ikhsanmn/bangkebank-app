"use client";

import Link from "next/link";
import { Landmark, LayoutDashboard, RefreshCcw, Rows3, SendHorizonal } from "lucide-react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/my-banks", label: "My Banks", icon: Landmark },
  { href: "/transaction-history", label: "History", icon: Rows3 },
  { href: "/transfer", label: "Transfer", icon: SendHorizonal },
  { href: "/connect-bank", label: "Connect", icon: RefreshCcw }
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen shrink-0 border-r border-border/60 bg-[#071522] px-5 py-6 text-white lg:sticky lg:top-0 lg:flex lg:w-[284px] lg:flex-col">
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
        <p className="text-xs uppercase tracking-[0.32em] text-white/55">BangkeBank</p>
        <h2 className="mt-3 font-serif text-3xl">Personal Banking OS</h2>
        <p className="mt-3 text-sm leading-6 text-white/65">
          Review balances, sync transaction history, and move money without
          leaving one workspace.
        </p>
      </div>

      <nav className="mt-8 space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors",
                active
                  ? "bg-white text-[#071522]"
                  : "text-white/72 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-[28px] border border-[#2b6f76]/50 bg-[#0d2437] p-5">
        <p className="text-sm font-medium">Sandbox connected</p>
        <p className="mt-2 text-sm leading-6 text-white/60">
          Better Auth and PostgreSQL are live in this build. Plaid Link and
          Dwolla are still represented as preview states.
        </p>
      </div>
    </aside>
  );
}
