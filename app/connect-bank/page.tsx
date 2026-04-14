import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, Link2, WalletCards } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { bankAccounts } from "@/lib/mock-data";
import { requireServerSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const steps = [
  {
    title: "Request link token",
    description: "A route handler requests the Plaid Link token for the signed-in user."
  },
  {
    title: "Launch Plaid Link",
    description: "User selects institution and the bank account to connect."
  },
  {
    title: "Create funding source",
    description: "The backend stores bank metadata in PostgreSQL after a successful token exchange."
  }
];

export default async function ConnectBankPage() {
  await requireServerSession();

  return (
    <main className="min-h-screen bg-[#071421] px-6 py-10 text-white sm:px-10 lg:px-14">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <p className="text-sm uppercase tracking-[0.34em] text-white/50">Connect bank</p>
            <h1 className="max-w-2xl font-serif text-5xl leading-tight">
              Finish onboarding by linking the accounts you want BangkeBank to watch.
            </h1>
            <p className="max-w-xl text-base leading-7 text-white/70">
              This screen captures the Plaid Link handoff from the PRD. Better
              Auth, PostgreSQL, and route handlers now power the backend, while
              the Plaid and Dwolla parts remain mocked until those integrations
              are added.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <Building2 className="size-5 text-[#86d0cb]" />
                <p className="mt-4 text-2xl font-semibold">Plaid</p>
                <p className="mt-2 text-sm text-white/65">Account link and sync</p>
              </div>
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <WalletCards className="size-5 text-[#f1c067]" />
                <p className="mt-4 text-2xl font-semibold">Dwolla</p>
                <p className="mt-2 text-sm text-white/65">ACH transfer rail</p>
              </div>
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <BadgeCheck className="size-5 text-[#caa1c1]" />
                <p className="mt-4 text-2xl font-semibold">PostgreSQL</p>
                <p className="mt-2 text-sm text-white/65">User, session, and bank metadata</p>
              </div>
            </div>
          </div>

          <Card className="border-white/10 bg-white/95 text-[#091c31] shadow-glow">
            <CardHeader>
              <CardTitle className="text-3xl">Plaid Link preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Setup progress</span>
                  <span className="font-medium">66%</span>
                </div>
                <Progress value={66} className="h-3 bg-[#e7e0d3]" />
              </div>

              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div
                    key={step.title}
                    className="flex gap-4 rounded-[24px] border border-border/70 bg-[#f7f4ef] p-4"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#091c31] text-sm font-semibold text-white">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-[#091c31]">{step.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[24px] border border-[#cce0df] bg-[#eef8f7] p-4 text-sm text-[#24556a]">
                <div className="flex items-center gap-3">
                  <Link2 className="size-4" />
                  Connected account previews below use mock data and are already ready in the dashboard.
                </div>
              </div>

              <div className="space-y-3">
                {bankAccounts.slice(0, 2).map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-[24px] border border-border/70 p-4"
                  >
                    <div>
                      <p className="font-medium text-[#091c31]">{account.institution}</p>
                      <p className="text-sm text-slate-500">
                        {account.name} •••• {account.mask}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-[#24556a]">
                      {account.routingHint}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/"
                  className={cn(buttonVariants(), "w-full sm:w-auto")}
                >
                  Finish and open dashboard
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/my-banks"
                  className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-auto")}
                >
                  Review connected accounts
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
