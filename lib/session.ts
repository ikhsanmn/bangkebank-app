import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { DEMO_TENANT_ID } from "@/lib/db/schema";

export async function getServerSession() {
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
  return auth.api.getSession({
    headers: request.headers
  });
}

// better-auth serves only the first-party web app, which is the demo tenant
// (lib/db authPool is pinned to it). Partner API requests take their tenant
// from the API key instead.
export const WEB_TENANT_ID = DEMO_TENANT_ID;
