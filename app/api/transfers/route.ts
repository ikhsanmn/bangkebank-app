import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureDatabase } from "@/lib/db/bootstrap";
import { getRequestSession } from "@/lib/session";
import { createTransferForUser, listTransfersForUser } from "@/lib/server/banking";

export const runtime = "nodejs";

const createTransferSchema = z.object({
  senderBankAccountId: z.string().uuid(),
  recipientEmail: z.string().email(),
  recipientShareableId: z.string().min(6),
  amount: z.coerce.number().positive(),
  note: z.string().max(280).optional()
});

export async function GET(request: Request) {
  await ensureDatabase();
  const session = await getRequestSession(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const transferList = await listTransfersForUser(session.user.id);
  return NextResponse.json({ transfers: transferList });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const session = await getRequestSession(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createTransferSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid transfer payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const transfer = await createTransferForUser(session.user.id, parsed.data);
    return NextResponse.json({ transfer }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create transfer.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
