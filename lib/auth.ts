import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { seedUserWorkspace } from "@/lib/server/banking";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg"
  }),
  advanced: {
    database: {
      generateId: () => crypto.randomUUID()
    }
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true
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
