import type { Route } from "next";
import { redirect } from "next/navigation";

export default function TenantConsoleIndex({ params }: { params: { tenantSlug: string } }) {
  redirect(`/console/${params.tenantSlug}/keys` as Route);
}
