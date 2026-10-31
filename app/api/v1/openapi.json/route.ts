import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { buildOpenApiDocument } from "@/lib/server/openapi";

export const runtime = "nodejs";

// Public: the description of the API, not access to it.
export function GET() {
  return NextResponse.json(buildOpenApiDocument(env.BETTER_AUTH_URL));
}
