import { NextResponse } from "next/server";
import { z } from "zod";

import { unauthorized } from "@/lib/server/http";
import { getRequestSession, WEB_TENANT_ID } from "@/lib/session";
import { getBankForUser, listTimelineForUser } from "@/lib/server/banking";

export const runtime = "nodejs";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export async function GET(
  request: Request,
  context: { params: { bankId: string } }
) {
  const session = await getRequestSession(request);

  if (!session) {
    return unauthorized();
  }

  const { searchParams } = new URL(request.url);
  const query = querySchema.safeParse({
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined
  });

  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid pagination", issues: query.error.flatten() },
      { status: 400 }
    );
  }

  const bank = await getBankForUser(WEB_TENANT_ID, session.user.id, context.params.bankId);
  if (!bank) {
    return NextResponse.json({ error: "Bank account not found." }, { status: 404 });
  }

  const { page, pageSize } = query.data;
  const transactions = await listTimelineForUser(WEB_TENANT_ID, session.user.id, {
    bankAccountId: bank.id,
    page,
    pageSize
  });

  return NextResponse.json({ transactions, page, pageSize });
}
