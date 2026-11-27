import { NextResponse, type NextRequest } from "next/server";
import { isProductionFrontendOrigin } from "@/lib/production-origins.mjs";

export function middleware(request: NextRequest) {
  const production = process.env.NEXT_PUBLIC_ONECONNECT_DEPLOYMENT === "production-review" ||
    isProductionFrontendOrigin(request.nextUrl.origin) ||
    isProductionFrontendOrigin("https://" + request.headers.get("host"));
  const isolated = process.env.NEXT_PUBLIC_CALL_TEST_MODE === "1" || process.env.NEXT_PUBLIC_CALL_INTEGRATION_MODE === "1";
  const api = request.nextUrl.pathname === "/api" || request.nextUrl.pathname.startsWith("/api/");
  if (api && (production || isolated)) return new NextResponse(null, { status: 404 });
  if (!production) {
    return NextResponse.next();
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
