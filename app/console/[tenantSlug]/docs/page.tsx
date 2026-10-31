import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/env";
import { OPERATIONS } from "@/lib/server/openapi";

export default function DocsPage() {
  const base = env.BETTER_AUTH_URL;
  const tryIt = [
    `export BB_KEY=bk_test_…   # from the API keys tab`,
    ``,
    `curl -s ${base}/api/v1/customers \\`,
    `  -H "Authorization: Bearer $BB_KEY" -H "Content-Type: application/json" \\`,
    `  -d '{"email":"siti@example.com","firstName":"Siti","lastName":"Rahma",`,
    `       "address1":"Jl. Merdeka No. 1","city":"Pangkalpinang",`,
    `       "province":"Kepulauan Bangka Belitung","postalCode":"33111",`,
    `       "dateOfBirth":"1990-08-17","nik":"1971015708900001"}'`,
    ``,
    `curl -s ${base}/api/v1/transfers \\`,
    `  -H "Authorization: Bearer $BB_KEY" -H "Content-Type: application/json" \\`,
    `  -H "Idempotency-Key: $(uuidgen)" \\`,
    `  -d '{"fromAccountId":"…","toAccountId":"…","amount":250000}'`
  ].join("\n");

  return (
    <div className="space-y-6">
      <Card className="border-0 bg-white/80 shadow-sm">
        <CardHeader>
          <CardTitle>Partner API v1</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-7 text-slate-700">
          <p>
            Authenticate with <code>Authorization: Bearer bk_test_…</code>. Amounts are whole rupiah. Errors look
            like <code>{`{ "error": { "code", "message", "requestId" } }`}</code>; quote the requestId when reporting a
            problem. Lists take <code>?limit=</code> (1–100) and <code>?cursor=</code> from the previous page.
          </p>
          <p>
            Machine-readable description:{" "}
            <a className="text-[#24556a] underline" href="/api/v1/openapi.json">
              /api/v1/openapi.json
            </a>{" "}
            (OpenAPI 3.1).
          </p>
        </CardContent>
      </Card>

      <Card className="border-0 bg-white/80 shadow-sm">
        <CardHeader>
          <CardTitle>Try it in the sandbox</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-2xl bg-[#071522] p-4 text-xs leading-6 text-white/90">{tryIt}</pre>
        </CardContent>
      </Card>

      <Card className="border-0 bg-white/80 shadow-sm">
        <CardHeader>
          <CardTitle>Endpoints</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/60">
            {OPERATIONS.map((op) => (
              <li key={`${op.method} ${op.path}`} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={op.method === "get" ? "secondary" : "default"}>{op.method.toUpperCase()}</Badge>
                  <code className="text-sm">{op.path}</code>
                  <Badge variant="outline">{op.scope}</Badge>
                  {op.idempotent ? <Badge variant="warning">Idempotency-Key</Badge> : null}
                </div>
                <p className="text-sm text-slate-600">
                  {op.summary}
                  {op.description ? `. ${op.description}` : "."}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
