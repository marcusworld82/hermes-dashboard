import { Suspense } from "react";
import { headers } from "next/headers";
import { isLocalHost } from "@/lib/server/http";
import { paths } from "@/lib/server/paths";
import { CrmFrame } from "./CrmFrame";

// The CRM only opens when the dashboard is used on this Mac. A phone reaches the
// dashboard through Tailscale under a different host name, so it is refused here,
// and the CRM itself also refuses anything that is not this Mac.
async function Guard() {
  const host = (await headers()).get("host");
  if (!isLocalHost(host)) {
    return (
      <div className="px-4 pt-10 max-w-md mx-auto text-center">
        <h1 className="text-xl font-semibold">The CRM opens on your Mac only</h1>
        <p className="text-sm text-[#6b7280] mt-2 leading-relaxed">It holds email sending and client data, so it stays on the Mac. Social, Pipeline, Chat and Agents all work here.</p>
      </div>
    );
  }
  return <CrmFrame url={paths.crmUrl} />;
}

export default function CrmPage() {
  return (
    <Suspense>
      <Guard />
    </Suspense>
  );
}
