import { depositSandboxFunds, TransferError } from "@/lib/server/banking";
import { ApiError, parseBody, partnerRoute } from "@/lib/server/partner-api";
import { depositSchema } from "@/lib/server/partner-schemas";

export const runtime = "nodejs";

// Sandbox-only test helper: credits play money from SANDBOX_FUNDING so a
// partner can fund the customers it creates. Not idempotent.
export const POST = partnerRoute(
  { route: "/api/v1/accounts/:accountId/sandbox-deposits", scope: "accounts:write" },
  async ({ request, tenantId, audit }, params) => {
    const { amount } = await parseBody(request, depositSchema);
    try {
      const line = await depositSandboxFunds(tenantId, params.accountId, amount, audit);
      return {
        status: 201,
        body: { deposit: { id: line.id, accountId: line.bankAccountId, amount: line.amount, ledgerEntryId: line.entryId, occurredAt: line.occurredAt } }
      };
    } catch (error) {
      if (error instanceof TransferError) {
        throw new ApiError(error.status, error.status === 404 ? "not_found" : "invalid_deposit", error.message);
      }
      throw error;
    }
  }
);
