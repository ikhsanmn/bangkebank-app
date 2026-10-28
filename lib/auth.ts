import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, DEMO_TENANT_ID, sessions, users, verifications } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { isPostalCode, isProvince, validateDateOfBirth, validateNik } from "@/lib/kyc";
import { auditContextFrom, recordAudit } from "@/lib/server/audit";
import { seedUserWorkspace } from "@/lib/server/banking";
import { encryptPii, hashNik } from "@/lib/server/pii";

const ONE_HOUR_SECONDS = 60 * 60;

const KYC_FIELDS = [
  "nik",
  "nikLast4",
  "nikHash",
  "dateOfBirth",
  "address1",
  "province",
  "postalCode",
  "tenantId"
];

function badRequest(message: string): never {
  throw new APIError("BAD_REQUEST", { message });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

// Validates the Indonesian identity fields and swaps the sensitive ones for
// ciphertext before the row is written. Plaintext NIK never reaches the database.
function prepareIdentity<T extends Record<string, unknown>>(user: T) {
  const nik = text(user.nik);
  const dateOfBirth = text(user.dateOfBirth);
  const address = text(user.address1);

  const error =
    validateDateOfBirth(dateOfBirth) ??
    validateNik(nik, dateOfBirth) ??
    (isProvince(text(user.province)) ? null : "Choose a province from the list.") ??
    (isPostalCode(text(user.postalCode)) ? null : "Postal code must be 5 digits.") ??
    (address.length >= 5 ? null : "Enter your street address.");
  if (error) {
    badRequest(error);
  }

  return {
    ...user,
    nik: encryptPii(nik),
    nikLast4: nik.slice(-4),
    nikHash: hashNik(nik),
    dateOfBirth: encryptPii(dateOfBirth),
    address1: encryptPii(address)
  };
}

function auditContext(
  context: { request?: Request } | null,
  actorUserId: string,
  tenantId: string | null
) {
  const base = context?.request
    ? auditContextFrom(context.request, actorUserId)
    : { actorUserId };
  return { ...base, tenantId };
}

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.BETTER_AUTH_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    // better-auth looks models up by singular name; our tables are exported plural.
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications
    }
  }),
  advanced: {
    database: {
      generateId: () => crypto.randomUUID()
    },
    useSecureCookies: env.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax"
    }
  },
  session: {
    expiresIn: 12 * ONE_HOUR_SECONDS,
    updateAge: ONE_HOUR_SECONDS
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 }
    }
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true
  },
  user: {
    // Identity fields are accepted once, at sign-up. `returned: false` keeps the
    // ciphertext out of session payloads; nikLast4 is derived, never client-set.
    additionalFields: {
      firstName: { type: "string", required: true },
      lastName: { type: "string", required: true },
      address1: { type: "string", required: true, returned: false },
      city: { type: "string", required: true },
      province: { type: "string", required: true },
      postalCode: { type: "string", required: true },
      dateOfBirth: { type: "string", required: true, returned: false },
      nik: { type: "string", required: true, returned: false },
      nikLast4: { type: "string", required: false, input: false, defaultValue: "" },
      nikHash: { type: "string", required: false, input: false, returned: false, defaultValue: "" },
      // Web sign-ups join the demo tenant; partner API customers are created
      // by their tenant through /api/v1 instead.
      tenantId: {
        type: "string",
        required: false,
        input: false,
        returned: false,
        defaultValue: DEMO_TENANT_ID
      }
    }
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({ data: prepareIdentity(user) }),
        after: async (user, context) => {
          await seedUserWorkspace(user.id);
          const tenantId = (user as { tenantId?: string }).tenantId ?? DEMO_TENANT_ID;
          await recordAudit(auditContext(context, user.id, tenantId), {
            action: "user.signed_up",
            outcome: "success",
            entityType: "user",
            entityId: user.id
          });
        }
      },
      update: {
        before: async (user) => {
          const locked = KYC_FIELDS.filter((field) => field in user);
          if (locked.length > 0) {
            throw new APIError("BAD_REQUEST", {
              message: `${locked.join(", ")} cannot be changed after sign-up.`
            });
          }
        }
      }
    },
    session: {
      create: {
        after: async (session, context) => {
          const [owner] = await db
            .select({ tenantId: users.tenantId })
            .from(users)
            .where(eq(users.id, session.userId))
            .limit(1);
          await recordAudit(auditContext(context, session.userId, owner?.tenantId ?? null), {
            action: "session.created",
            outcome: "success",
            entityType: "session",
            entityId: session.id
          });
        }
      }
    }
  }
});
