import { CreateKeyForm } from "@/components/console/create-key-form";
import { RevokeKeyButton } from "@/components/console/revoke-key-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireConsoleMembership } from "@/lib/console-session";
import { API_SCOPES } from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import { listApiKeys } from "@/lib/server/api-keys";
import { canManageKeys } from "@/lib/server/console";

function keyStatus(key: { revokedAt: Date | null; expiresAt: Date | null }) {
  if (key.revokedAt) return { label: "Revoked", variant: "outline" as const };
  if (key.expiresAt && key.expiresAt <= new Date()) return { label: "Expired", variant: "outline" as const };
  if (key.expiresAt) return { label: "Expiring", variant: "warning" as const };
  return { label: "Active", variant: "success" as const };
}

export default async function KeysPage({ params }: { params: { tenantSlug: string } }) {
  const { membership } = await requireConsoleMembership(params.tenantSlug);
  const keys = await listApiKeys(membership.tenantId);
  const manage = canManageKeys(membership.role);

  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <Card className="border-0 bg-white/80 shadow-sm">
        <CardHeader>
          <CardTitle>API keys</CardTitle>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="text-sm text-slate-500">No keys yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Status</TableHead>
                  {manage ? <TableHead className="sr-only">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => {
                  const status = keyStatus(key);
                  const live = status.label === "Active" || status.label === "Expiring";
                  return (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell>
                        <code className="text-xs">{`bk_test_${key.prefix}_…${key.last4}`}</code>
                      </TableCell>
                      <TableCell className="max-w-[16rem] text-xs text-slate-600">{key.scopes.join(", ")}</TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      {manage ? (
                        <TableCell className="text-right">
                          {live ? <RevokeKeyButton slug={membership.slug} keyId={key.id} name={key.name} /> : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 bg-white/80 shadow-sm">
        <CardHeader>
          <CardTitle>New key</CardTitle>
        </CardHeader>
        <CardContent>
          {manage ? (
            <CreateKeyForm slug={membership.slug} scopes={API_SCOPES} />
          ) : (
            <p className="text-sm text-slate-500">Only owners and admins can create or revoke keys.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
