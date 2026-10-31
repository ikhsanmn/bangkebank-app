import type { ReactNode } from "react";
import Link from "next/link";

import { ConsoleNav } from "@/components/console/console-nav";
import { SignOutButton } from "@/components/horizon/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { requireConsoleMembership } from "@/lib/console-session";

export default async function TenantConsoleLayout({
  children,
  params
}: {
  children: ReactNode;
  params: { tenantSlug: string };
}) {
  const { membership } = await requireConsoleMembership(params.tenantSlug);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/50 bg-[#fbf8f2]/85">
        <div className="container flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <Link href="/console" className="text-xs uppercase tracking-[0.32em] text-[#24556a]">
              Partner console
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="font-serif text-2xl text-[#091c31]">{membership.name}</h1>
              <Badge variant="outline">{membership.role}</Badge>
              {membership.status !== "active" ? <Badge variant="warning">{membership.status}</Badge> : null}
            </div>
          </div>
          <SignOutButton />
        </div>
      </header>
      <main className="container space-y-6 py-8">
        <ConsoleNav slug={membership.slug} />
        {children}
      </main>
    </div>
  );
}
