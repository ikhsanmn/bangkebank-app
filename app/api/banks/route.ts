import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureDatabase } from "@/lib/db/bootstrap";
import { getRequestSession } from "@/lib/session";
import { createBankForUser, listBanksForUser } from "@/lib/server/banking";

export const runtime = "nodejs";

const createBankSchema = z.object({
  institution: z.string().min(2),
  name: z.string().min(2),
  subtype: z.string().min(2),
  mask: z.string().min(4).max(4),
  currentBalance: z.coerce.number().min(0),
  availableBalance: z.coerce.number().min(0),
  routingHint: z.string().min(2).optional()
});

export async function GET(request: Request) {
  await ensureDatabase();
  const session = await getRequestSession(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const banks = await listBanksForUser(session.user.id);
  return NextResponse.json({ banks });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const session = await getRequestSession(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createBankSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bank payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const bank = await createBankForUser(session.user.id, parsed.data);
  return NextResponse.json({ bank }, { status: 201 });
}
