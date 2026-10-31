import { NextResponse } from "next/server";
import { z } from "zod";

import { API_SCOPES } from "@/lib/db/schema";
import { ApiKeyError, createApiKey } from "@/lib/server/api-keys";
import { requireKeyManager } from "@/lib/server/console-auth";
import { invalidJson, readJson } from "@/lib/server/http";

export const runtime = "nodejs";

const createKeySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    scopes: z.array(z.enum(API_SCOPES)).min(1)
  })
  .strict();

// Returns the full token once; the console shows it and never again.
export async function POST(request: Request, { params }: { params: { tenantSlug: string } }) {
  const gate = await requireKeyManager(request, params.tenantSlug);
  if (!gate.ok) {
    return gate.response;
  }

  const body = await readJson(request);
  if (body === undefined) {
    return invalidJson();
  }
  const parsed = createKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Give the key a name and at least one scope." }, { status: 400 });
  }

  try {
    const { apiKey, token } = await createApiKey(gate.membership.tenantId, parsed.data, gate.audit);
    return NextResponse.json({ apiKey, token }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiKeyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
