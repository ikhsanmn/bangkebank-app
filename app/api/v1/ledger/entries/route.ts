import { listParams, partnerRoute } from "@/lib/server/partner-api";
import { decodeCursor, listLedgerEntries, MAX_LIST_LIMIT } from "@/lib/server/partner";

export const runtime = "nodejs";

// The tenant's journal, newest first, each entry with its balanced postings.
export const GET = partnerRoute(
  { route: "/api/v1/ledger/entries", scope: "ledger:read" },
  async ({ request, tenantId }) => {
    const { limit, cursor } = listParams(request, MAX_LIST_LIMIT);
    return { status: 200, body: await listLedgerEntries(tenantId, { limit, cursor: decodeCursor(cursor) }) };
  }
);
