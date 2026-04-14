import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db/bootstrap";

export async function getServerSession() {
  await ensureDatabase();

  return auth.api.getSession({
    headers: headers()
  });
}

export async function requireServerSession() {
  const session = await getServerSession();

  if (!session) {
    redirect("/sign-in");
  }

  return session;
}

export async function getRequestSession(request: Request) {
  await ensureDatabase();

  return auth.api.getSession({
    headers: request.headers
  });
}
