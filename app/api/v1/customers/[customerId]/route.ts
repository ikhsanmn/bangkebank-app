import { partnerRoute } from "@/lib/server/partner-api";
import { getCustomer } from "@/lib/server/partner";

export const runtime = "nodejs";

export const GET = partnerRoute(
  { route: "/api/v1/customers/:customerId", scope: "customers:read" },
  async ({ tenantId }, params) => ({
    status: 200,
    body: { customer: await getCustomer(tenantId, params.customerId) }
  })
);
