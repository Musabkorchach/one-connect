import { NextResponse } from "next/server";

export function middleware() {
  if (process.env.NEXT_PUBLIC_CALL_TEST_MODE === "1" || process.env.NEXT_PUBLIC_CALL_INTEGRATION_MODE === "1") {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
