import { and, count, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiRequests, type ApiScope } from "@/lib/db/schema";
import { type VerifiedApiKey, hasScope, verifyApiKey } from "@/lib/server/api-keys";
import { type AuditContext, auditContextFrom } from "@/lib/server/audit";
import { readJson } from "@/lib/server/http";
import { PartnerError } from "@/lib/server/partner";
import { withTenant } from "@/lib/server/tenant";

// Shared plumbing for every /api/v1 route: bearer-key authentication, scope
// checks, a per-key rate limit, one error shape, and a log row per call.
//
// Errors always look like { error: { code, message, requestId } }.

export const RATE_LIMIT_PER_MINUTE = 120;

const IDEMPOTENCY_KEY = z.string().min(8).max(128);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type PartnerContext = {
  key: VerifiedApiKey;
  tenantId: string;
  request: Request;
  requestId: string;
  audit: AuditContext;
  idempotencyKey: string | null;
};

type Result = { status: number; body: unknown };

type RouteContext = { params: Record<string, string> };

function errorResponse(requestId: string, error: ApiError, headers: Record<string, string> = {}) {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, requestId }, ...error.extra },
    { status: error.status, headers: { "X-Request-Id": requestId, ...headers } }
  );
}

function toApiError(error: unknown, requestId: string): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof PartnerError) {
    return new ApiError(error.status, error.code, error.message);
  }
  console.error(`[api/v1] unexpected failure (request ${requestId})`, error);
  return new ApiError(500, "internal_error", "Something went wrong. Quote the requestId if you contact support.");
}

async function rateLimited(key: VerifiedApiKey) {
  const [row] = await withTenant(key.tenantId, (tx) =>
    tx
      .select({ calls: count() })
      .from(apiRequests)
      .where(and(eq(apiRequests.apiKeyId, key.id), gte(apiRequests.occurredAt, sql`date_trunc('minute', now())`)))
  );
  return row.calls >= RATE_LIMIT_PER_MINUTE;
}

function secondsToNextMinute() {
  return 60 - new Date().getUTCSeconds();
}

export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const body = await readJson(request);
  if (body === undefined) {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(422, "validation_error", `${issue.path.join(".") || "body"}: ${issue.message}`);
  }
  return parsed.data;
}

export function listParams(request: Request, maxLimit: number) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 25);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new ApiError(422, "validation_error", `limit: must be a whole number from 1 to ${maxLimit}`);
  }
  return { limit, cursor: url.searchParams.get("cursor") };
}

// Wraps a route handler. `route` is the path template stored in the request
// log, so ids never end up in usage data.
export function partnerRoute(
  options: { route: string; scope: ApiScope; requireIdempotencyKey?: boolean },
  handler: (context: PartnerContext, params: Record<string, string>) => Promise<Result>
) {
  return async function route(request: Request, routeContext: RouteContext) {
    const requestId = `req_${crypto.randomUUID().replace(/-/g, "")}`;
    const started = performance.now();

    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    const key = token ? await verifyApiKey(token) : null;
    if (!key) {
      // Unauthenticated calls have no tenant to log against.
      return errorResponse(
        requestId,
        new ApiError(401, "unauthorized", "Provide a valid API key as: Authorization: Bearer bk_test_…"),
        { "WWW-Authenticate": "Bearer" }
      );
    }

    const rawIdempotencyKey = request.headers.get("idempotency-key");
    let response: NextResponse;
    try {
      if (await rateLimited(key)) {
        throw new ApiError(429, "rate_limited", `Limit is ${RATE_LIMIT_PER_MINUTE} requests per minute per key.`);
      }
      if (!hasScope(key, options.scope)) {
        throw new ApiError(403, "insufficient_scope", `This key lacks the ${options.scope} scope.`);
      }
      let idempotencyKey: string | null = null;
      if (options.requireIdempotencyKey) {
        const parsed = IDEMPOTENCY_KEY.safeParse(rawIdempotencyKey);
        if (!parsed.success) {
          throw new ApiError(400, "idempotency_key_required", "Send an Idempotency-Key header of 8-128 characters.");
        }
        idempotencyKey = parsed.data;
      }

      const result = await handler(
        {
          key,
          tenantId: key.tenantId,
          request,
          requestId,
          idempotencyKey,
          audit: { ...auditContextFrom(request, null), tenantId: key.tenantId }
        },
        routeContext?.params ?? {}
      );
      response = NextResponse.json(result.body, {
        status: result.status,
        headers: { "X-Request-Id": requestId }
      });
    } catch (error) {
      const apiError = toApiError(error, requestId);
      response = errorResponse(
        requestId,
        apiError,
        apiError.status === 429 ? { "Retry-After": String(secondsToNextMinute()) } : {}
      );
    }

    try {
      await withTenant(key.tenantId, (tx) =>
        tx.insert(apiRequests).values({
          id: requestId,
          tenantId: key.tenantId,
          apiKeyId: key.id,
          method: request.method,
          route: options.route,
          status: response.status,
          durationMs: Math.round(performance.now() - started),
          idempotencyKey: rawIdempotencyKey?.slice(0, 128) ?? null
        })
      );
    } catch (error) {
      // The response is already decided; a lost log row must not fail the call.
      console.error(`[api/v1] could not log request ${requestId}`, error);
    }
    return response;
  };
}
