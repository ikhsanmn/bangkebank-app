import { listParams, partnerRoute } from "@/lib/server/partner-api";
import { decodeCursor, getStatement, MAX_LIST_LIMIT } from "@/lib/server/partner";

export const runtime = "nodejs";

// Newest first. Pass the returned nextCursor as ?cursor= for the next page.
export const GET = partnerRoute(
  { route: "/api/v1/accounts/:accountId/statement", scope: "accounts:read" },
  async ({ request, tenantId }, params) => {
    const { limit, cursor } = listParams(request, MAX_LIST_LIMIT);
    return {
      status: 200,
      body: await getStatement(tenantId, params.accountId, { limit, cursor: decodeCursor(cursor) })
    };
  }
);
