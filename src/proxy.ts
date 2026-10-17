import { NextResponse, type NextRequest } from "next/server";

// Blocks changes that come from another website open in the same browser.
// Every request that changes something must come from this dashboard's own pages.
export function proxy(req: NextRequest) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && host && new URL(origin).host !== host) {
      return new NextResponse("Changes must come from the dashboard itself.", { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
