import { NextResponse } from "next/server";

import { ensureDatabase } from "@/lib/db/bootstrap";
import { getRequestSession } from "@/lib/session";
import { getUserProfile } from "@/lib/server/banking";

export const runtime = "nodejs";

export async function GET(request: Request) {
  await ensureDatabase();
  const session = await getRequestSession(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getUserProfile(session.user.id);

  return NextResponse.json({
    user: session.user,
    profile
  });
}
