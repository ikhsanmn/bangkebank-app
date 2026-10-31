import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PUBLIC_PAGES = ["/sign-in", "/sign-up"];

// Two cheap gates in front of the app. Every route and page still checks the
// session itself; these only stop cross-site writes and bounce signed-out
// visitors early.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    // better-auth runs its own origin check on /api/auth. The partner API
    // (/api/v1) authenticates with bearer API keys, never cookies, so a
    // cross-site page can't ride on a victim's credentials there.
    const exempt = pathname.startsWith("/api/auth/") || pathname.startsWith("/api/v1/");
    if (STATE_CHANGING.has(request.method) && !exempt) {
      const origin = request.headers.get("origin");
      if (!origin || origin !== request.nextUrl.origin) {
        return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
      }
    }
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PAGES.some((page) => pathname.startsWith(page));
  if (!isPublic && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
