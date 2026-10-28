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
import { formatCurrency } from "@/lib/format";
import { getDashboardData } from "@/lib/server/banking";
import { requireServerSession, WEB_TENANT_ID } from "@/lib/session";
import { cn } from "@/lib/utils";
import { toAccountView, toTransactionView } from "@/lib/views";

export default async function DashboardPage() {
  const session = await requireServerSession();
  const dashboard = await getDashboardData(WEB_TENANT_ID, session.user.id);
  const accounts = dashboard.accounts.map(toAccountView);
  const firstName =
    ("firstName" in session.user && typeof session.user.firstName === "string"
      ? session.user.firstName
      : session.user.name.split(" ")[0]) || "there";
  const largestFlow = Math.max(...dashboard.dailyNetFlow.map((day) => Math.abs(day.value)), 1);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome back, ${firstName}`}
        description="Your combined position across sandbox accounts, the latest activity, and quick access to transfers."
        actions={
          <>
            <Link href="/transfer" className={cn(buttonVariants({ variant: "outline" }))}>
              Transfer funds
            </Link>
            <Link href="/my-banks" className={cn(buttonVariants())}>
              View accounts
            </Link>
          </>
        }
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <SummaryCard
          title="Total current balance"
          value={formatCurrency(dashboard.totals.totalBalance)}
          change="Across all sandbox accounts"
          icon={Wallet}
        />
        <SummaryCard
          title="Available cash"
          value={formatCurrency(dashboard.totals.totalAvailable)}
          change="Ready for transfers"
          icon={Landmark}
        />
        <SummaryCard
          title="Accounts"
          value={`${dashboard.totals.linkedBanks}`}
          change="Sandbox accounts in your workspace"
          icon={CreditCard}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card className="border-0 bg-white/80 shadow-sm">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Daily net flow</CardTitle>
              <p className="mt-2 text-sm text-slate-500">
                Money in minus money out, last 7 days (UTC)
              </p>
            </div>
            <Badge variant="outline">IDR</Badge>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 rounded-[28px] bg-[#f7f4ef] p-6">
              {dashboard.dailyNetFlow.map((point) => (
                <div key={point.label} className="flex flex-1 flex-col items-center gap-3">
                  <div className="flex h-56 w-full items-end">
                    <div
                      className={cn(
                        "w-full rounded-t-[20px]",
                        point.value >= 0
                          ? "bg-gradient-to-t from-[#0f4c81] via-[#2d6f87] to-[#78a7a5]"
                          : "bg-gradient-to-t from-[#8a5a44] to-[#c5855f]"
                      )}
                      style={{ height: `${Math.max(2, (Math.abs(point.value) / largestFlow) * 100)}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{point.label}</p>
                    <p className="mt-1 text-xs font-medium text-[#091c31]">
                      {point.value > 0 ? "+" : ""}
                      {formatCurrency(point.value)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <BalanceRing accounts={accounts} total={dashboard.totals.totalBalance} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card className="border-0 bg-white/80 shadow-sm">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Recent transactions</CardTitle>
              <p className="mt-2 text-sm text-slate-500">Latest activity across your accounts</p>
            </div>
            <Link href="/transaction-history" className={cn(buttonVariants({ variant: "ghost" }))}>
              Open full history
              <ArrowRight className="size-4" />
            </Link>
          </CardHeader>
          <CardContent>
            <TransactionsTable
              transactions={dashboard.recentTransactions.slice(0, 5).map(toTransactionView)}
            />
          </CardContent>
        </Card>

        <CategoryBreakdown categories={dashboard.categoryBreakdown} />
      </section>
    </div>
  );
}
