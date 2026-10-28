import type { Route } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireConsoleMembership } from "@/lib/console-session";
import { formatDateTime } from "@/lib/format";
import { listAuditActions, listAuditEvents } from "@/lib/server/console";
import { cn } from "@/lib/utils";

// ?action= filters; ?before=<iso>~<id> pages back (keyset, newest first).
function parseBefore(value: string | undefined) {
  const [at, id] = (value ?? "").split("~");
  const occurredAt = new Date(at ?? "");
  return id && !Number.isNaN(occurredAt.getTime()) ? { occurredAt, id } : null;
}

export default async function AuditPage({
  params,
  searchParams
}: {
  params: { tenantSlug: string };
  searchParams: { action?: string; before?: string };
}) {
  const { membership } = await requireConsoleMembership(params.tenantSlug);
  const actions = await listAuditActions(membership.tenantId);
  const action = actions.includes(searchParams.action ?? "") ? searchParams.action : undefined;
  const { events, hasMore } = await listAuditEvents(membership.tenantId, {
    action,
    before: parseBefore(searchParams.before)
  });
  const base = `/console/${membership.slug}/audit`;
  const last = events[events.length - 1];
  const olderHref = last
    ? `${base}?${new URLSearchParams({ ...(action ? { action } : {}), before: `${last.occurredAt.toISOString()}~${last.id}` })}`
    : base;

  return (
    <Card className="border-0 bg-white/80 shadow-sm">
      <CardHeader className="space-y-4">
        <CardTitle>Audit log</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Link href={base as Route} className={cn(buttonVariants({ variant: action ? "outline" : "default", size: "sm" }))}>
            All
          </Link>
          {actions.map((name) => (
            <Link
              key={name}
              href={`${base}?action=${encodeURIComponent(name)}` as Route}
              className={cn(buttonVariants({ variant: name === action ? "default" : "outline", size: "sm" }))}
            >
              {name}
            </Link>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">No events.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>IP address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-sm text-slate-600">{formatDateTime(event.occurredAt)}</TableCell>
                  <TableCell>
                    <code className="text-xs">{event.action}</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={event.outcome === "success" ? "success" : "warning"}>{event.outcome}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {event.entityType ? `${event.entityType} ${event.entityId?.slice(0, 8) ?? ""}` : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {event.actorUserId ? event.actorUserId.slice(0, 8) : "API key"}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{event.ipAddress ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {hasMore ? (
          <Link href={olderHref as Route} className={cn(buttonVariants({ variant: "outline" }))}>
            Older events
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
