import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

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
