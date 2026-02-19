import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow NBA labs mock feed to return JSON without auth redirects.
  // (This is safe: it contains no user data and no secrets.)
  if (pathname === "/api/labs/nba/mock-games") {
    return NextResponse.next();
  }

  // --- existing middleware logic (keep yours below) ---
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
