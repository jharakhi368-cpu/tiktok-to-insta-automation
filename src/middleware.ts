import { NextResponse, type NextRequest } from "next/server";

/**
 * Route gate.
 *
 * Edge middleware can't reach Postgres, so this only checks that a session
 * cookie is *present* — every API route re-validates it against the database
 * via requireUser(). The gate exists so an unauthenticated visitor is sent to
 * /login before any page shell renders; the API is what actually protects data.
 */
const COOKIE = "reelay_session";

/** Endpoints that must answer without a session. */
const PUBLIC_EXACT = new Set([
  "/login",
  "/api/auth/request", // send a one-time code
  "/api/auth/verify", // check it and open the session
  "/api/auth/me",
  "/api/health",
  "/api/telegram/webhook",
  "/api/tick", // uptime monitor + scheduler wake-up
]);

/** Media URLs are fetched by Instagram/Zernio, which carry no cookie.
 *  They're unguessable 36-char UUIDs. */
function isPublicMedia(pathname: string): boolean {
  return /^\/api\/videos\/[0-9a-f-]{36}\/(file|cover)/i.test(pathname);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // static assets and build output
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/images") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const hasSession = Boolean(req.cookies.get(COOKIE)?.value);
  const isPublic = PUBLIC_EXACT.has(pathname) || isPublicMedia(pathname);

  // signed in but looking at the login page → go to the app
  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  // signed out and asking for something private → sign in first
  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
