import { partnerRoute } from "@/lib/server/partner-api";
import { getAccount } from "@/lib/server/partner";

export const runtime = "nodejs";

export const GET = partnerRoute(
  { route: "/api/v1/accounts/:accountId", scope: "accounts:read" },
  async ({ tenantId }, params) => ({
    status: 200,
    body: { account: await getAccount(tenantId, params.accountId) }
  })
);
