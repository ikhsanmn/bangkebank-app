import { Info } from "lucide-react";

import { PageHeader } from "@/components/horizon/page-header";
import { TransferForm } from "@/components/horizon/transfer-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { listBanksForUser, listTransfersForUser } from "@/lib/server/banking";
import { requireServerSession } from "@/lib/session";

const RECENT_TRANSFER_COUNT = 5;

const STATUS_BADGES = {
  settled: { label: "Settled", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  failed: { label: "Failed", variant: "outline" }
} as const;

export default async function TransferPage() {
  const session = await requireServerSession();
  const [banks, transferList] = await Promise.all([
    listBanksForUser(session.user.id),
    listTransfersForUser(session.user.id)
  ]);
  const recent = transferList.slice(0, RECENT_TRANSFER_COUNT);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Funds Transfer"
        title="Send money with a shareable ID"
        description="Choose an account, enter the recipient's email and shareable ID, then review before sending."
      />

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <TransferForm
          banks={banks.map((bank) => ({
            id: bank.id,
            name: bank.name,
            institution: bank.institution,
            availableBalance: Number(bank.availableBalance)
          }))}
        />

        <div className="space-y-6">
          <Card className="border-0 bg-white/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Recent transfers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {recent.length === 0 ? (
                <p className="text-sm text-slate-500">No transfers yet.</p>
              ) : null}
              {recent.map((transfer) => {
                const outgoing = transfer.senderUserId === session.user.id;
                const status = transfer.status as keyof typeof STATUS_BADGES;
                return (
                  <div
                    key={transfer.id}
                    className="flex items-start justify-between gap-4 rounded-[24px] border border-border/70 bg-[#f7f4ef] p-4"
                  >
                    <div>
                      <p className="font-medium text-[#091c31]">
                        {outgoing ? `To ${transfer.recipientName}` : "Received"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">{formatDate(transfer.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p
                        className={
                          status === "failed"
                            ? "font-medium text-slate-400 line-through"
                            : outgoing
                              ? "font-medium text-[#091c31]"
                              : "font-medium text-emerald-700"
                        }
                      >
                        {outgoing ? "-" : "+"}
                        {formatCurrency(Number(transfer.amount))}
                      </p>
                      <Badge variant={STATUS_BADGES[status].variant}>
                        {STATUS_BADGES[status].label}
                      </Badge>
                      {transfer.failureReason ? (
                        <p className="mt-1 text-xs text-rose-700">{transfer.failureReason}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-0 bg-[#eef8f7] shadow-sm">
            <CardContent className="flex items-start gap-3 p-6 text-sm text-[#24556a]">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Transfers in this demo move sandbox balances between BangkeBank accounts and
                settle instantly. The recipient&apos;s email must match the owner of the shareable ID.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
