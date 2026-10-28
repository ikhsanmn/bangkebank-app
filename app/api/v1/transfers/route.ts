import { z } from "zod";

import { MAX_TRANSFER_RUPIAH } from "@/lib/format";
import { ApiError, parseBody, partnerRoute } from "@/lib/server/partner-api";
import { createPartnerTransfer } from "@/lib/server/partner";

export const runtime = "nodejs";

const createTransferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  // Whole rupiah, capped at the BI-FAST per-transfer limit.
  amount: z.number().int().positive().max(MAX_TRANSFER_RUPIAH),
  note: z.string().max(280).optional()
});

// 201 settled, 200 replayed (same Idempotency-Key and payload), 422 when the
// attempt failed for lack of funds; the failed transfer is still returned.
export const POST = partnerRoute(
  { route: "/api/v1/transfers", scope: "transfers:write", requireIdempotencyKey: true },
  async ({ request, tenantId, audit, idempotencyKey }) => {
    const input = await parseBody(request, createTransferSchema);
    const { transfer, replayed } = await createPartnerTransfer(
      tenantId,
      { ...input, idempotencyKey: idempotencyKey! },
      audit
    );
    if (transfer.status === "failed") {
      throw new ApiError(422, "insufficient_funds", transfer.failureReason ?? "The transfer failed.", {
        transfer,
        replayed
      });
    }
    return { status: replayed ? 200 : 201, body: { transfer, replayed } };
  }
);
