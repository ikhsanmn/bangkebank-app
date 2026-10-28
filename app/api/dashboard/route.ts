import { NextResponse } from "next/server";

import { unauthorized } from "@/lib/server/http";
import { getRequestSession } from "@/lib/session";
import { getDashboardData, getUserProfile } from "@/lib/server/banking";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getRequestSession(request);

  if (!session) {
    return unauthorized();
  }

  const [dashboard, profile] = await Promise.all([
    getDashboardData(session.user.id),
    getUserProfile(session.user.id)
  ]);

  return NextResponse.json({
    profile,
    ...dashboard
  });
}
