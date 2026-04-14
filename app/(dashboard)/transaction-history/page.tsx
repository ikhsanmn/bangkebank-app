import { ChevronLeft, ChevronRight, Filter, History } from "lucide-react";

import { PageHeader } from "@/components/horizon/page-header";
import { TransactionsTable } from "@/components/horizon/transactions-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { bankAccounts, formatCurrency, recentTransactions } from "@/lib/mock-data";

const accountLabelMap = Object.fromEntries(
  bankAccounts.map((account) => [account.id, `${account.institution} •••• ${account.mask}`])
);

export default function TransactionHistoryPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Transaction History"
        title="Unified activity feed"
        description="This view combines synced Plaid account transactions with internal transfer records, matching the PRD requirement for a single timeline."
      />

      <section className="grid gap-4 xl:grid-cols-[1fr_2fr]">
        <Card className="border-0 bg-white/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <History className="size-5 text-[#24556a]" />
              Account focus
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm text-slate-500">Select linked account</p>
              <Select defaultValue={bankAccounts[0].id}>
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.institution} • {account.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="rounded-[28px] bg-[#f7f4ef] p-5">
              <p className="text-sm text-slate-500">Current balance</p>
              <p className="mt-2 text-3xl font-semibold text-[#091c31]">
                {formatCurrency(bankAccounts[0].balance)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="success">Plaid synced</Badge>
                <Badge variant="outline">Internal transfers merged</Badge>
              </div>
            </div>

            <div className="space-y-4">
              {bankAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between gap-4 rounded-[24px] border border-border/70 bg-white p-4"
                >
                  <div>
                    <p className="font-medium text-[#091c31]">{account.name}</p>
                    <p className="text-sm text-slate-500">{account.institution}</p>
                  </div>
                  <p className="font-medium text-[#091c31]">
                    {formatCurrency(account.balance)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-white/80 shadow-sm">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Full timeline</CardTitle>
              <p className="mt-2 text-sm text-slate-500">
                Status, channel, category, and date for each transfer or bank sync entry
              </p>
            </div>
            <Button variant="outline">
              <Filter className="size-4" />
              Filters
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <TransactionsTable
              transactions={recentTransactions}
              showAccount
              accountLabelMap={accountLabelMap}
            />

            <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Showing 8 merged transactions from the latest sync cycle
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
                <Button variant="outline" size="sm">
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
