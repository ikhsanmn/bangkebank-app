import { NextResponse } from "next/server";
import { z } from "zod";

import { MAX_TRANSFER_RUPIAH } from "@/lib/format";
import { auditContextFrom } from "@/lib/server/audit";
import { readJson, invalidJson, unauthorized } from "@/lib/server/http";
import { getRequestSession, WEB_TENANT_ID } from "@/lib/session";
import {
  TransferError,
  createTransferForUser,
  listTransfersForUser
} from "@/lib/server/banking";

export const runtime = "nodejs";

const createTransferSchema = z.object({
  senderBankAccountId: z.string().uuid(),
  recipientEmail: z.string().email(),
  recipientShareableId: z.string().min(6).max(64),
  // Whole rupiah only; strings are rejected so "1.500" can't be misread.
  amount: z.number().int().positive().max(MAX_TRANSFER_RUPIAH),
  note: z.string().max(280).optional()
});

const idempotencyKeySchema = z.string().min(8).max(128);

export async function GET(request: Request) {
  const session = await getRequestSession(request);

  if (!session) {
    return unauthorized();
  }

  const transferList = await listTransfersForUser(WEB_TENANT_ID, session.user.id);
  return NextResponse.json({ transfers: transferList });
}

export async function POST(request: Request) {
  const session = await getRequestSession(request);

  if (!session) {
    return unauthorized();
  }

  const body = await readJson(request);
  if (body === undefined) {
    return invalidJson();
  }

  const parsed = createTransferSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid transfer payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const rawKey = request.headers.get("Idempotency-Key");
  const key = rawKey === null ? undefined : idempotencyKeySchema.safeParse(rawKey);
  if (key && !key.success) {
    return NextResponse.json(
      { error: "Idempotency-Key must be 8-128 characters." },
      { status: 400 }
    );
  }

  try {
    const { transfer, replayed } = await createTransferForUser(
      WEB_TENANT_ID,
      session.user.id,
      { ...parsed.data, idempotencyKey: key?.data },
      auditContextFrom(request, session.user.id)
    );
    if (transfer.status === "failed") {
      return NextResponse.json(
        { error: transfer.failureReason, transfer, replayed },
        { status: 422 }
      );
    }
    return NextResponse.json({ transfer, replayed }, { status: replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof TransferError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[transfers] unexpected failure", error);
    return NextResponse.json({ error: "Unable to create transfer." }, { status: 500 });
  }
}
