import { parseBody, partnerRoute } from "@/lib/server/partner-api";
import { createCustomer } from "@/lib/server/partner";
import { createCustomerSchema } from "@/lib/server/partner-schemas";

export const runtime = "nodejs";

export const POST = partnerRoute(
  { route: "/api/v1/customers", scope: "customers:write" },
  async ({ request, tenantId, audit }) => {
    const input = await parseBody(request, createCustomerSchema);
    return { status: 201, body: { customer: await createCustomer(tenantId, input, audit) } };
  }
);
