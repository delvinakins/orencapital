// src/middleware.ts
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

// ✅ IMPORTANT: exclude /api so API routes don't get treated like pages (HTML)
// This fixes: curl .../api/... returning <!DOCTYPE html>...
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};