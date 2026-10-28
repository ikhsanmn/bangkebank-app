import { Building2, Link2, ShieldCheck } from "lucide-react";

import { AccountCard } from "@/components/horizon/account-card";
import { PageHeader } from "@/components/horizon/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { listBanksForUser } from "@/lib/server/banking";
import { requireServerSession } from "@/lib/session";
import { toAccountView } from "@/lib/views";

export default async function MyBanksPage() {
  const session = await requireServerSession();
  const accounts = (await listBanksForUser(session.user.id)).map(toAccountView);
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
  const institutions = new Set(accounts.map((account) => account.institution)).size;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="My Banks"
        title="Your accounts"
        description="Check balances and available cash, and copy an account's shareable ID when someone needs to send you money."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-0 bg-white/80 shadow-sm">
          <CardContent className="flex items-start justify-between p-6">
            <div>
              <p className="text-sm text-slate-500">Institutions</p>
              <p className="mt-2 text-3xl font-semibold text-[#091c31]">{institutions}</p>
            </div>
            <Building2 className="size-5 text-[#24556a]" aria-hidden />
          </CardContent>
        </Card>
        <Card className="border-0 bg-white/80 shadow-sm">
          <CardContent className="flex items-start justify-between p-6">
            <div>
              <p className="text-sm text-slate-500">Combined balances</p>
              <p className="mt-2 text-3xl font-semibold text-[#091c31]">
                {formatCurrency(totalBalance)}
              </p>
            </div>
            <ShieldCheck className="size-5 text-[#24556a]" aria-hidden />
          </CardContent>
        </Card>
        <Card className="border-0 bg-white/80 shadow-sm">
          <CardContent className="flex items-start justify-between p-6">
            <div>
              <p className="text-sm text-slate-500">Accounts</p>
              <p className="mt-2 text-3xl font-semibold text-[#091c31]">{accounts.length}</p>
            </div>
            <Link2 className="size-5 text-[#24556a]" aria-hidden />
          </CardContent>
        </Card>
      </section>

      {accounts.length === 0 ? (
        <Card className="border-0 bg-white/80 shadow-sm">
          <CardContent className="p-6 text-sm text-slate-500">
            You don&apos;t have any accounts yet.
          </CardContent>
        </Card>
      ) : (
        <section className="grid gap-6 xl:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </section>
      )}
    </div>
  );
}
