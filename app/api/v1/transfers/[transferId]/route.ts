import { partnerRoute } from "@/lib/server/partner-api";
import { getTransfer } from "@/lib/server/partner";

export const runtime = "nodejs";

export const GET = partnerRoute(
  { route: "/api/v1/transfers/:transferId", scope: "transfers:read" },
  async ({ tenantId }, params) => ({
    status: 200,
    body: { transfer: await getTransfer(tenantId, params.transferId) }
  })
);
