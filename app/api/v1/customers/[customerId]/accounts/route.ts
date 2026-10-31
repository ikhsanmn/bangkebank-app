import { parseBody, partnerRoute } from "@/lib/server/partner-api";
import { openAccount } from "@/lib/server/partner";
import { openAccountSchema } from "@/lib/server/partner-schemas";

export const runtime = "nodejs";

// Accounts open with a zero balance; fund them with a sandbox deposit.
export const POST = partnerRoute(
  { route: "/api/v1/customers/:customerId/accounts", scope: "accounts:write" },
  async ({ request, tenantId, audit }, params) => {
    const input = await parseBody(request, openAccountSchema);
    return { status: 201, body: { account: await openAccount(tenantId, params.customerId, input, audit) } };
  }
);
