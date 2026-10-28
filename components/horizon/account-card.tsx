import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Wallet2 } from "lucide-react";

import { CopyShareableId } from "@/components/horizon/copy-shareable-id";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { AccountView } from "@/lib/views";

export function AccountCard({ account }: { account: AccountView }) {
  return (
    <Card className="overflow-hidden border-0 bg-white/90 shadow-sm">
      <div className={`h-40 bg-gradient-to-br ${account.tone} p-6 text-white`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-white/65">
              {account.institution}
            </p>
            <h3 className="mt-3 font-serif text-3xl">{account.name}</h3>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/10 p-3">
            <Wallet2 className="size-5" />
          </div>
        </div>
        <div className="mt-8 flex items-center justify-between text-sm text-white/80">
          <span>{account.subtype}</span>
          <span>•••• {account.mask}</span>
        </div>
      </div>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Current balance</p>
            <p className="mt-1 text-3xl font-semibold text-[#091c31]">
              {formatCurrency(account.balance)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Available {formatCurrency(account.available)}
            </p>
          </div>
          <Badge variant="success">{account.routingHint}</Badge>
        </div>

        <div className="rounded-[24px] border border-border/70 bg-[#f7f4ef] p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Building2 className="size-4" />
            Shareable account ID
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-sm font-medium text-[#091c31]">
              {account.shareableId}
            </p>
            <CopyShareableId value={account.shareableId} />
          </div>
        </div>

        <Link
          href={`/transaction-history?account=${account.id}` as Route}
          className="flex items-center gap-2 text-sm font-medium text-[#24556a] transition-colors hover:text-[#091c31]"
        >
          View account activity
          <ArrowRight className="size-4" />
        </Link>
      </CardContent>
    </Card>
  );
}
