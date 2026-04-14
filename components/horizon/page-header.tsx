import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[32px] border border-border/60 bg-white/80 p-6 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.32em] text-[#24556a]">{eyebrow}</p>
        <h1 className="font-serif text-3xl text-[#091c31] sm:text-4xl">{title}</h1>
        <p className="max-w-2xl text-sm leading-7 text-slate-600">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {actions ?? (
          <>
            <Link
              href="/transaction-history"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Export snapshot
            </Link>
            <Link href="/connect-bank" className={cn(buttonVariants())}>
              Connect bank
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
