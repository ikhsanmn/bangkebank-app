import { NextResponse } from "next/server";

import { revokeApiKey } from "@/lib/server/api-keys";
import { requireKeyManager } from "@/lib/server/console-auth";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { tenantSlug: string; keyId: string } }
) {
  const gate = await requireKeyManager(request, params.tenantSlug);
  if (!gate.ok) {
    return gate.response;
  }

  const revoked = await revokeApiKey(gate.membership.tenantId, params.keyId, gate.audit);
  if (!revoked) {
    return NextResponse.json({ error: "No active key with that id." }, { status: 404 });
  }
  return NextResponse.json({ revoked: true });
}
