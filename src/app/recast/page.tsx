import { Suspense } from "react";
import { headers } from "next/headers";
import { isLocalHost } from "@/lib/server/http";
import { ToolFrame } from "@/components/ToolFrame";

// Recast runs on this Mac only, so it is refused when the dashboard is opened from another device.
async function Guard() {
  if (!isLocalHost((await headers()).get("host"))) {
    return (
      <div className="px-4 pt-10 max-w-md mx-auto text-center">
        <h1 className="text-xl font-semibold">Recast opens on your Mac only</h1>
        <p className="text-sm text-[#6b7280] mt-2">Open the dashboard on your Mac to use it.</p>
      </div>
    );
  }
  return <ToolFrame id="recast" about="Breaks down a video and writes captions and a script from it." keyNote="Recast has no Google API key yet, so analysis is off. Add GOOGLE_API_KEY to its .env.local, then restart it." />;
}

export default function Page() {
  return (
    <Suspense>
      <Guard />
    </Suspense>
  );
}
