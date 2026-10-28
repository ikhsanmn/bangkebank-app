import type { Route } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/horizon/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { listMemberships } from "@/lib/server/console";
import { requireServerSession } from "@/lib/session";

export default async function ConsoleHome() {
  const session = await requireServerSession();
  const memberships = await listMemberships(session.user.id);

  return (
    <main className="container space-y-8 py-8">
      <PageHeader
        eyebrow="Partner console"
        title="Your tenants"
        description="Manage API keys and read the audit log and API usage of the fintech tenants you belong to."
        actions={<></>}
      />
      {memberships.length === 0 ? (
        <Card className="border-0 bg-white/80 shadow-sm">
          <CardContent className="p-6 text-sm text-slate-500">
            You aren&apos;t a member of any tenant yet. A platform admin adds you with
            scripts/tenant/create.mjs.
          </CardContent>
        </Card>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {memberships.map((membership) => (
            <Link key={membership.tenantId} href={`/console/${membership.slug}/keys` as Route}>
              <Card className="border-0 bg-white/80 shadow-sm transition-colors hover:bg-white">
                <CardContent className="space-y-1 p-6">
                  <p className="font-serif text-2xl text-[#091c31]">{membership.name}</p>
                  <p className="text-sm text-slate-500">
                    {membership.slug} · {membership.role}
                    {membership.status !== "active" ? ` · ${membership.status}` : ""}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
