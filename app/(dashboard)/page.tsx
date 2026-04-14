import Link from "next/link";
import { ArrowRight, CreditCard, Landmark, Wallet } from "lucide-react";

import { BalanceRing } from "@/components/horizon/balance-ring";
import { CategoryBreakdown } from "@/components/horizon/category-breakdown";
import { PageHeader } from "@/components/horizon/page-header";
import { SummaryCard } from "@/components/horizon/summary-card";
import { TransactionsTable } from "@/components/horizon/transactions-table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bankAccounts, formatCurrency, recentTransactions, totalAvailable, totalBalance, userProfile, weeklyBalances } from "@/lib/mock-data";
import { requireServerSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await requireServerSession();
  const firstName =
    ("firstName" in session.user && typeof session.user.firstName === "string"
      ? session.user.firstName
      : session.user.name.split(" ")[0]) || userProfile.firstName;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome back, ${firstName}`}
        description="See the combined position across your linked banks, review the latest activity, and jump into ACH transfers from one place."
        actions={
          <>
            <Link
              href="/transfer"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Transfer funds
            </Link>
            <Link href="/connect-bank" className={cn(buttonVariants())}>
              Connect bank
            </Link>
          </>
        }
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <SummaryCard
          title="Total current balance"
          value={formatCurrency(totalBalance)}
          change="Up 8.2% from last month"
          tone="positive"
          icon={Wallet}
        />
        <SummaryCard
          title="Available cash"
          value={formatCurrency(totalAvailable)}
          change="Ready for transfers and bills"
          tone="positive"
          icon={Landmark}
        />
        <SummaryCard
          title="Linked bank accounts"
          value={`${bankAccounts.length}`}
          change="All funding sources active"
          icon={CreditCard}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card className="border-0 bg-white/80 shadow-sm">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Cash momentum</CardTitle>
              <p className="mt-2 text-sm text-slate-500">
                Weekly balance signal across your connected accounts
              </p>
            </div>
            <Badge variant="outline">en-US • USD</Badge>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 rounded-[28px] bg-[#f7f4ef] p-6">
              {weeklyBalances.map((point) => (
                <div key={point.label} className="flex flex-1 flex-col items-center gap-3">
                  <div className="flex h-56 w-full items-end">
                    <div
                      className="w-full rounded-t-[20px] bg-gradient-to-t from-[#0f4c81] via-[#2d6f87] to-[#78a7a5]"
                      style={{ height: `${point.value}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                      {point.label}
                    </p>
                    <p className="mt-1 text-sm font-medium text-[#091c31]">{point.value}%</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <BalanceRing />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card className="border-0 bg-white/80 shadow-sm">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Recent transactions</CardTitle>
              <p className="mt-2 text-sm text-slate-500">
                Combined Plaid-style synced activity and internal transfer records
              </p>
            </div>
            <Link
              href="/transaction-history"
              className={cn(buttonVariants({ variant: "ghost" }))}
            >
              Open full history
              <ArrowRight className="size-4" />
            </Link>
          </CardHeader>
          <CardContent>
            <TransactionsTable transactions={recentTransactions.slice(0, 5)} />
          </CardContent>
        </Card>

        <CategoryBreakdown />
      </section>
    </div>
  );
}
