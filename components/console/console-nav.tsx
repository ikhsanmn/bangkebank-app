"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, KeyRound, ScrollText, Activity } from "lucide-react";

import { cn } from "@/lib/utils";

const sections = [
  { path: "keys", label: "API keys", icon: KeyRound },
  { path: "audit", label: "Audit log", icon: ScrollText },
  { path: "usage", label: "Usage", icon: Activity },
  { path: "docs", label: "API docs", icon: BookOpen }
] as const;

export function ConsoleNav({ slug }: { slug: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Console" className="flex flex-wrap gap-2">
      {sections.map((section) => {
        const href = `/console/${slug}/${section.path}`;
        const active = pathname === href;
        const Icon = section.icon;
        return (
          <Link
            key={section.path}
            href={href as Route}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-2xl px-4 py-2 text-sm transition-colors",
              active ? "bg-[#071522] text-white" : "bg-white/70 text-slate-700 hover:bg-white"
            )}
          >
            <Icon className="size-4" aria-hidden />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
