import { z } from "zod";

import { parseBody, partnerRoute } from "@/lib/server/partner-api";
import { createCustomer } from "@/lib/server/partner";

export const runtime = "nodejs";

// Identity rules (NIK structure, date of birth, province, postal code) are
// enforced by lib/server/identity.ts; this only checks the shape.
const createCustomerSchema = z.object({
  email: z.string().email().max(254),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  address1: z.string().max(200),
  city: z.string().trim().min(1).max(100),
  province: z.string().max(100),
  postalCode: z.string().max(10),
  dateOfBirth: z.string().max(10),
  nik: z.string().max(16)
});

export const POST = partnerRoute(
  { route: "/api/v1/customers", scope: "customers:write" },
  async ({ request, tenantId, audit }) => {
    const input = await parseBody(request, createCustomerSchema);
    return { status: 201, body: { customer: await createCustomer(tenantId, input, audit) } };
  }
);
