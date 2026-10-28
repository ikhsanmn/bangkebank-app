import { z } from "zod";

import { parseBody, partnerRoute } from "@/lib/server/partner-api";
import { openAccount } from "@/lib/server/partner";

export const runtime = "nodejs";

const openAccountSchema = z.object({
  name: z.string().trim().min(1).max(100),
  subtype: z.enum(["Savings", "Current"])
});

// Accounts open with a zero balance; fund them with a sandbox deposit.
export const POST = partnerRoute(
  { route: "/api/v1/customers/:customerId/accounts", scope: "accounts:write" },
  async ({ request, tenantId, audit }, params) => {
    const input = await parseBody(request, openAccountSchema);
    return { status: 201, body: { account: await openAccount(tenantId, params.customerId, input, audit) } };
  }
);
