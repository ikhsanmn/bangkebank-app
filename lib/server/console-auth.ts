import { NextResponse } from "next/server";

import { auditContextFrom } from "@/lib/server/audit";
import { canManageKeys, getMembership } from "@/lib/server/console";
import { unauthorized } from "@/lib/server/http";
import { getRequestSession } from "@/lib/session";

// Resolves the signed-in console user and their role in the URL's tenant, for
// the cookie-authenticated /api/console routes (which keep the same-origin
// POST gate in middleware). Non-members get 404, viewers get 403 on writes.
export async function requireKeyManager(request: Request, slug: string) {
  const session = await getRequestSession(request);
  if (!session) {
    return { ok: false, response: unauthorized() } as const;
  }
  const membership = await getMembership(session.user.id, slug);
  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: "Tenant not found." }, { status: 404 }) } as const;
  }
  if (!canManageKeys(membership.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Only owners and admins can manage API keys." }, { status: 403 })
    } as const;
  }
  return {
    ok: true,
    membership,
    audit: { ...auditContextFrom(request, session.user.id), tenantId: membership.tenantId }
  } as const;
}
