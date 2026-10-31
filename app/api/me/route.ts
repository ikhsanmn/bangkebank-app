import { NextResponse } from "next/server";

import { unauthorized } from "@/lib/server/http";
import { getRequestSession, WEB_TENANT_ID } from "@/lib/session";
import { getUserProfile } from "@/lib/server/banking";

export const runtime = "nodejs";

// Returns an explicit field list; identity data (NIK, DOB, address) stays server-side
// apart from the last four NIK digits.
export async function GET(request: Request) {
  const session = await getRequestSession(request);

  if (!session) {
    return unauthorized();
  }

  const profile = await getUserProfile(WEB_TENANT_ID, session.user.id);
  return NextResponse.json({ profile });
}
