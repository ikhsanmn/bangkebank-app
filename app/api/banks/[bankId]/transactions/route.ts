import { NextResponse } from "next/server";

import { ensureDatabase } from "@/lib/db/bootstrap";
import { getRequestSession } from "@/lib/session";
import { listTimelineForUser } from "@/lib/server/banking";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: { bankId: string } }
) {
  await ensureDatabase();
  const session = await getRequestSession(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "20");

  const transactions = await listTimelineForUser(session.user.id, {
    bankAccountId: context.params.bankId,
    page,
    pageSize
  });

  return NextResponse.json({
    transactions,
    page,
    pageSize
  });
}
