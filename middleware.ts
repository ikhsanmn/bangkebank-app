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
    // better-auth runs its own origin check on /api/auth.
    if (STATE_CHANGING.has(request.method) && !pathname.startsWith("/api/auth/")) {
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
