import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireConsoleMembership } from "@/lib/console-session";
import { getUsageSummary, USAGE_WINDOW_DAYS } from "@/lib/server/console";
import { RATE_LIMIT_PER_MINUTE } from "@/lib/server/partner-api";

function percent(part: number, whole: number) {
  return whole === 0 ? "0%" : `${((part / whole) * 100).toFixed(1)}%`;
}

export default async function UsagePage({ params }: { params: { tenantSlug: string } }) {
  const { membership } = await requireConsoleMembership(params.tenantSlug);
  const usage = await getUsageSummary(membership.tenantId);
  const busiest = Math.max(1, ...usage.daily.map((day) => day.total));

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: `Requests (${USAGE_WINDOW_DAYS} days)`, value: usage.totals.total.toLocaleString("id-ID") },
          { label: "Error rate", value: percent(usage.totals.errors, usage.totals.total) },
          { label: "Rate limit", value: `${RATE_LIMIT_PER_MINUTE}/min per key` }
        ].map((stat) => (
          <Card key={stat.label} className="border-0 bg-white/80 shadow-sm">
            <CardContent className="p-6">
              <p className="text-sm text-slate-500">{stat.label}</p>
              <p className="mt-2 text-3xl font-semibold text-[#091c31]">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-0 bg-white/80 shadow-sm">
        <CardHeader>
          <CardTitle>Requests per day (WIB)</CardTitle>
        </CardHeader>
        <CardContent>
          {usage.daily.length === 0 ? (
            <p className="text-sm text-slate-500">No API calls in the last {USAGE_WINDOW_DAYS} days.</p>
          ) : (
            <ul className="space-y-2">
              {usage.daily.map((day) => (
                <li key={day.day} className="grid grid-cols-[6.5rem_1fr_6rem] items-center gap-3 text-sm">
                  <span className="text-slate-600">{day.day}</span>
                  <span className="h-3 rounded-full bg-slate-100" aria-hidden>
                    <span
                      className="block h-3 rounded-full bg-[#24556a]"
                      style={{ width: `${(day.total / busiest) * 100}%` }}
                    />
                  </span>
                  <span className="text-right text-slate-700">
                    {day.total}
                    {day.errors ? <span className="text-rose-600"> · {day.errors} err</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 bg-white/80 shadow-sm">
        <CardHeader>
          <CardTitle>By endpoint</CardTitle>
        </CardHeader>
        <CardContent>
          {usage.byRoute.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead className="text-right">p95</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.byRoute.map((row) => (
                  <TableRow key={`${row.method} ${row.route}`}>
                    <TableCell>
                      <code className="text-xs">
                        {row.method} {row.route}
                      </code>
                    </TableCell>
                    <TableCell className="text-right">{row.total}</TableCell>
                    <TableCell className="text-right">{percent(row.errors, row.total)}</TableCell>
                    <TableCell className="text-right">{row.p95Ms} ms</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
