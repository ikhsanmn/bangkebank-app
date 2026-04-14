import { CheckCircle2 } from "lucide-react";

import { PageHeader } from "@/components/horizon/page-header";
import { TransferForm } from "@/components/horizon/transfer-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bankAccounts, formatCurrency, transferRecipients } from "@/lib/mock-data";

export default function TransferPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Funds Transfer"
        title="Move money with shareable account IDs"
        description="Select a source account, fill in the recipient email and shareable ID, then submit an ACH transfer request. The new backend can store transfer records now, while Dwolla execution remains mocked."
      />

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <TransferForm />

        <div className="space-y-6">
          <Card className="border-0 bg-white/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Recipient preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {transferRecipients.map((recipient) => (
                <div
                  key={recipient.email}
                  className="rounded-[24px] border border-border/70 bg-[#f7f4ef] p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-[#091c31]">{recipient.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{recipient.email}</p>
                    </div>
                    <Badge variant="outline">Saved recipient</Badge>
                  </div>
                  <p className="mt-4 font-mono text-sm text-[#24556a]">
                    {recipient.shareableId}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">{recipient.note}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-0 shadow-sm">
            <div className="bg-gradient-to-br from-[#091c31] via-[#12425a] to-[#2f7c85] p-6 text-white">
              <p className="text-sm uppercase tracking-[0.28em] text-white/60">
                Transfer summary
              </p>
              <p className="mt-4 font-serif text-4xl">$250.00</p>
              <p className="mt-2 text-sm text-white/75">
                From Primary Checking to Jordan Lee
              </p>
            </div>
            <CardContent className="space-y-4 bg-white p-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Estimated arrival</span>
                <span className="font-medium text-[#091c31]">1-2 business days</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Transfer rail</span>
                <span className="font-medium text-[#091c31]">Dwolla ACH</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Status after submit</span>
                <span className="font-medium text-[#091c31]">Processing</span>
              </div>
              <div className="rounded-[24px] bg-[#eef8f7] p-4 text-sm text-[#24556a]">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="size-4" />
                  Internal transfer logs will appear in transaction history once the request is saved.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
