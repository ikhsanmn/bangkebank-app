import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SummaryCard({
  title,
  value,
  change,
  tone = "default",
  icon: Icon
}: {
  title: string;
  value: string;
  change: string;
  tone?: "default" | "positive";
  icon: LucideIcon;
}) {
  const positive = tone === "positive";

  return (
    <Card className="border-0 bg-white/80 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm text-slate-500">{title}</p>
            <p className="text-3xl font-semibold tracking-tight text-[#091c31]">
              {value}
            </p>
          </div>
          <div className="rounded-2xl bg-[#eff4f2] p-3 text-[#24556a]">
            <Icon className="size-5" />
          </div>
        </div>
        <div
          className={cn(
            "mt-5 flex items-center gap-2 text-sm",
            positive ? "text-emerald-700" : "text-slate-500"
          )}
        >
          {positive ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
          <span>{change}</span>
        </div>
      </CardContent>
    </Card>
  );
}
