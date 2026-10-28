import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import { db } from "@/lib/db";
import { accounts, sessions, users, verifications } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { seedUserWorkspace } from "@/lib/server/banking";

const ONE_HOUR_SECONDS = 60 * 60;

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
    additionalFields: {
      firstName: {
        type: "string",
        required: true
      },
      lastName: {
        type: "string",
        required: true
      },
      address1: {
        type: "string",
        required: true
      },
      city: {
        type: "string",
        required: true
      },
      state: {
        type: "string",
        required: true
      },
      postalCode: {
        type: "string",
        required: true
      },
      dateOfBirth: {
        type: "string",
        required: true
      },
      ssnLast4: {
        type: "string",
        required: true
      }
    }
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await seedUserWorkspace(user.id);
        }
      }
    }
  }
});
