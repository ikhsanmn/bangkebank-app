import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import type { TransactionView } from "@/lib/views";

export function TransactionsTable({
  transactions,
  showAccount = false,
  accountLabelMap
}: {
  transactions: TransactionView[];
  showAccount?: boolean;
  accountLabelMap?: Record<string, string>;
}) {
  if (transactions.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">No transactions yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Activity</TableHead>
          {showAccount ? <TableHead>Account</TableHead> : null}
          <TableHead>Status</TableHead>
          <TableHead>Channel</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((transaction) => {
          const incoming = transaction.direction === "credit";

          return (
            <TableRow key={transaction.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-[#eff4f2] p-2 text-[#24556a]">
                    {incoming ? (
                      <ArrowDownLeft className="size-4" />
                    ) : (
                      <ArrowUpRight className="size-4" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-[#091c31]">{transaction.name}</p>
                    <p className="text-sm text-slate-500">
                      {transaction.category} • {transaction.source}
                    </p>
                  </div>
                </div>
              </TableCell>
              {showAccount ? (
                <TableCell className="text-slate-600">
                  {accountLabelMap?.[transaction.accountId] ?? "Account"}
                </TableCell>
              ) : null}
              <TableCell>
                <Badge
                  variant={
                    transaction.status === "Completed"
                      ? "success"
                      : transaction.status === "Processing"
                        ? "warning"
                        : "outline"
                  }
                >
                  {transaction.status}
                </Badge>
              </TableCell>
              <TableCell className="text-slate-600">{transaction.channel}</TableCell>
              <TableCell className="text-slate-600">{formatDate(transaction.date)}</TableCell>
              <TableCell className="text-right">
                <span
                  className={incoming ? "font-medium text-emerald-700" : "font-medium text-[#091c31]"}
                >
                  <span className="sr-only">{incoming ? "Received " : "Sent "}</span>
                  {incoming ? "+" : "-"}
                  {formatCurrency(Math.abs(transaction.amount))}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
