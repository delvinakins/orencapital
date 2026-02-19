import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow NBA mock feed (labs) without auth redirects
  if (pathname.startsWith("/api/labs/nba/mock-games")) {
    return NextResponse.next();
  }

  // ...existing middleware logic below...
  return NextResponse.next();
}
