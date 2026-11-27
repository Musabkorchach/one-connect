import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_ONECONNECT_DEPLOYMENT !== "production-review") {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/") || request.nextUrl.pathname === "/api") {
    return new NextResponse(null, { status: 404 });
  }
  const headers = { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse(null, { status: 405, headers: { ...headers, Allow: "GET, HEAD" } });
  }
  const key = process.env.ONECONNECT_PRODUCTION_VALIDATION_KEY?.trim();
  if (!key) return new NextResponse(null, { status: 404, headers });
  return new NextResponse(request.method === "HEAD" ? null : key, { headers });
}

export const config = { matcher: ["/validation-key.txt", "/api/:path*"] };
