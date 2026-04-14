import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db/bootstrap";

export const runtime = "nodejs";

const handler = toNextJsHandler(auth);

export async function GET(request: Request, context: { params: { all: string[] } }) {
  await ensureDatabase();
  return handler.GET(request, context);
}

export async function POST(request: Request, context: { params: { all: string[] } }) {
  await ensureDatabase();
  return handler.POST(request, context);
}
