import type { Route } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, History } from "lucide-react";

import { PageHeader } from "@/components/horizon/page-header";
import { TransactionsTable } from "@/components/horizon/transactions-table";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { listBanksForUser, listTimelineForUser } from "@/lib/server/banking";
import { requireServerSession, WEB_TENANT_ID } from "@/lib/session";
import { cn } from "@/lib/utils";
import { toAccountView, toTransactionView } from "@/lib/views";

const PAGE_SIZE = 10;

function historyHref(account: string | undefined, page: number): Route {
  const params = new URLSearchParams();
  if (account) params.set("account", account);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/transaction-history${query ? `?${query}` : ""}` as Route;
}

export default async function TransactionHistoryPage({
  searchParams
}: {
  searchParams: { account?: string; page?: string };
}) {
  const session = await requireServerSession();
  const accounts = (await listBanksForUser(WEB_TENANT_ID, session.user.id)).map(toAccountView);

  // Only accept an account filter that belongs to this user.
  const selected = accounts.find((account) => account.id === searchParams.account);
  const requestedPage = Number.parseInt(searchParams.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  // Fetch one extra row to learn whether a next page exists.
  const rows = await listTimelineForUser(WEB_TENANT_ID, session.user.id, {
    bankAccountId: selected?.id,
    page,
    pageSize: PAGE_SIZE,
    lookahead: 1
  });
  const hasNext = rows.length > PAGE_SIZE;
  const transactions = rows.slice(0, PAGE_SIZE).map(toTransactionView);

  const accountLabelMap = Object.fromEntries(
    accounts.map((account) => [account.id, `${account.institution} •••• ${account.mask}`])
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Transaction History"
        title="All activity"
        description="Every transaction and transfer across your accounts, newest first."
      />

      <section className="grid gap-4 xl:grid-cols-[1fr_2fr]">
        <Card className="border-0 bg-white/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <History className="size-5 text-[#24556a]" aria-hidden />
              Filter by account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <nav aria-label="Filter by account" className="space-y-3">
              <Link
                href={historyHref(undefined, 1)}
                aria-current={!selected ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between gap-4 rounded-[24px] border bg-white p-4",
                  !selected ? "border-[#24556a] ring-1 ring-[#24556a]" : "border-border/70"
                )}
              >
                <p className="font-medium text-[#091c31]">All accounts</p>
              </Link>
              {accounts.map((account) => {
                const active = selected?.id === account.id;
                return (
                  <Link
                    key={account.id}
                    href={historyHref(account.id, 1)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between gap-4 rounded-[24px] border bg-white p-4",
                      active ? "border-[#24556a] ring-1 ring-[#24556a]" : "border-border/70"
                    )}
                  >
                    <div>
                      <p className="font-medium text-[#091c31]">{account.name}</p>
                      <p className="text-sm text-slate-500">{account.institution}</p>
                    </div>
                    <p className="font-medium text-[#091c31]">{formatCurrency(account.balance)}</p>
                  </Link>
                );
              })}
            </nav>
          </CardContent>
        </Card>

        <Card className="border-0 bg-white/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">
              {selected ? `${selected.name} activity` : "Full timeline"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <TransactionsTable
              transactions={transactions}
              showAccount={!selected}
              accountLabelMap={accountLabelMap}
            />

            <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">Page {page}</p>
              <nav aria-label="Pagination" className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    href={historyHref(selected?.id, page - 1)}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                    Previous
                  </Link>
                ) : null}
                {hasNext ? (
                  <Link
                    href={historyHref(selected?.id, page + 1)}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Next
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                ) : null}
              </nav>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
