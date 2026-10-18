import { NextResponse, type NextRequest } from "next/server";

// Only this Mac's own addresses (and any Tailscale name added to DASHBOARD_HOSTS) may use the API.
// Checking the Host header blocks DNS-rebinding, where a website points its own domain at 127.0.0.1.
function allowedHosts() {
  const extra = (process.env.DASHBOARD_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return new Set(["127.0.0.1:3200", "localhost:3200", "[::1]:3200", ...extra]);
}

export function proxy(req: NextRequest) {
  const hosts = allowedHosts();
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (!hosts.has(host)) return new NextResponse("Unknown host.", { status: 403 });

  if (req.method !== "GET" && req.method !== "HEAD") {
    // Every change must come from the dashboard's own pages. Browsers always send Origin on these requests.
    const origin = req.headers.get("origin");
    let originHost = "";
    try {
      originHost = origin ? new URL(origin).host.toLowerCase() : "";
    } catch {}
    if (!originHost || originHost !== host) {
      return new NextResponse("Changes must come from the dashboard itself.", { status: 403 });
    }
    // JSON routes only accept JSON, so a plain cross-site form cannot reach them. Skill, social media and reference uploads are the form routes.
    const type = req.headers.get("content-type") ?? "";
    const isUpload = ["/api/skills", "/api/social/media", "/api/social/reference"].includes(req.nextUrl.pathname) && req.method === "POST";
    const hasBody = req.method !== "DELETE";
    const sendsBody = !!type || Number(req.headers.get("content-length") ?? 0) > 0;
    if (hasBody && !isUpload && sendsBody && !type.startsWith("application/json")) {
      return new NextResponse("Send JSON.", { status: 415 });
    }
    if (isUpload && !type.startsWith("multipart/form-data")) {
      return new NextResponse("Send a file upload.", { status: 415 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
