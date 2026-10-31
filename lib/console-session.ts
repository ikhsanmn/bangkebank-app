import { notFound } from "next/navigation";

import { getMembership } from "@/lib/server/console";
import { requireServerSession } from "@/lib/session";

// For console layouts and pages. Next renders a layout and its page in
// parallel, so the layout's check can't protect the page: each calls this.
// Non-members get a 404, so the console never confirms a tenant slug exists.
export async function requireConsoleMembership(slug: string) {
  const session = await requireServerSession();
  const membership = await getMembership(session.user.id, slug);
  if (!membership) {
    notFound();
  }
  return { session, membership };
}
