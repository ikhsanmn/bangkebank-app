import { Building2, Link2, ShieldCheck } from "lucide-react";

import { AccountCard } from "@/components/horizon/account-card";
import { PageHeader } from "@/components/horizon/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { bankAccounts, formatCurrency, totalBalance } from "@/lib/mock-data";

export default function MyBanksPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="My Banks"
        title="All connected accounts"
        description="Browse every linked bank, check balances and available cash, and copy a shareable account ID when someone needs to send you money."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-0 bg-white/80 shadow-sm">
          <CardContent className="flex items-start justify-between p-6">
            <div>
              <p className="text-sm text-slate-500">Total linked institutions</p>
              <p className="mt-2 text-3xl font-semibold text-[#091c31]">
                {bankAccounts.length}
              </p>
            </div>
            <Building2 className="size-5 text-[#24556a]" />
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
            <ShieldCheck className="size-5 text-[#24556a]" />
          </CardContent>
        </Card>
        <Card className="border-0 bg-white/80 shadow-sm">
          <CardContent className="flex items-start justify-between p-6">
            <div>
              <p className="text-sm text-slate-500">Shareable IDs ready</p>
              <p className="mt-2 text-3xl font-semibold text-[#091c31]">100%</p>
            </div>
            <Link2 className="size-5 text-[#24556a]" />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        {bankAccounts.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </section>

      <Card className="border-0 bg-white/80 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-medium text-[#091c31]">
              Plaid Link and Dwolla funding sources are still mocked in this build.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              The cards above now sit on top of the new PostgreSQL and Better Auth
              backend, and are ready for live Plaid and Dwolla integrations next.
            </p>
          </div>
          <Badge variant="outline">Backend ready</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
