import { NextResponse } from "next/server";
import { z } from "zod";

import { auditContextFrom } from "@/lib/server/audit";
import { readJson, invalidJson, unauthorized } from "@/lib/server/http";
import { getRequestSession } from "@/lib/session";
import { createBankForUser, listBanksForUser } from "@/lib/server/banking";

export const runtime = "nodejs";

// Balances are deliberately absent: new accounts open at zero.
const createBankSchema = z
  .object({
    institution: z.string().min(2).max(80),
    name: z.string().min(2).max(80),
    subtype: z.string().min(2).max(40),
    mask: z.string().regex(/^\d{4}$/),
    routingHint: z.string().min(2).max(80).optional()
  })
  .strict();

export async function GET(request: Request) {
  const session = await getRequestSession(request);

  if (!session) {
    return unauthorized();
  }

  const banks = await listBanksForUser(session.user.id);
  return NextResponse.json({ banks });
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

  const parsed = createBankSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bank payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const bank = await createBankForUser(
    session.user.id,
    parsed.data,
    auditContextFrom(request, session.user.id)
  );
  return NextResponse.json({ bank }, { status: 201 });
}
