import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { listBanksForUser } from "@/lib/server/banking";
import { requireServerSession } from "@/lib/session";
import { cn } from "@/lib/utils";

// Post-signup landing: shows the sandbox accounts the demo created for this user.
export default async function ConnectBankPage() {
  const session = await requireServerSession();
  const banks = await listBanksForUser(session.user.id);

  return (
    <main className="min-h-screen bg-[#071421] px-6 py-10 text-white sm:px-10 lg:px-14">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.34em] text-white/70">Welcome</p>
          <h1 className="font-serif text-4xl leading-tight sm:text-5xl">
            Your sandbox workspace is ready.
          </h1>
          <p className="text-base leading-7 text-white/80">
            This portfolio demo gives every new user a few sandbox accounts with demo
            balances, so you can try transfers right away. Real bank linking isn&apos;t part
            of the demo.
          </p>
        </div>

        <Card className="border-0 bg-white text-[#091c31] shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <BadgeCheck className="size-5 text-[#24556a]" aria-hidden />
              Sandbox accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {banks.length === 0 ? (
              <p className="text-sm text-slate-500">No accounts were created.</p>
            ) : null}
            {banks.map((bank) => (
              <div
                key={bank.id}
                className="flex items-center justify-between gap-4 rounded-[24px] border border-border/70 bg-[#f7f4ef] p-4"
              >
                <div>
                  <p className="font-medium">{bank.name}</p>
                  <p className="text-sm text-slate-500">
                    {bank.institution} •••• {bank.mask}
                  </p>
                </div>
                <p className="font-medium">{formatCurrency(Number(bank.currentBalance))}</p>
              </div>
            ))}
            <Link href="/" className={cn(buttonVariants({ size: "lg" }), "mt-2 w-full")}>
              Open dashboard
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
