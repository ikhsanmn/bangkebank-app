import { NextResponse } from "next/server";

import { unauthorized } from "@/lib/server/http";
import { getRequestSession } from "@/lib/session";
import { getUserProfile } from "@/lib/server/banking";

export const runtime = "nodejs";

// Returns an explicit field list; identity data (DOB, address, SSN digits) stays server-side.
export async function GET(request: Request) {
  const session = await getRequestSession(request);

  if (!session) {
    return unauthorized();
  }

  const profile = await getUserProfile(session.user.id);
  return NextResponse.json({ profile });
}
