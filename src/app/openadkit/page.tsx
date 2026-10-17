import { Suspense } from "react";
import { headers } from "next/headers";
import { isLocalHost } from "@/lib/server/http";
import { ToolFrame } from "@/components/ToolFrame";

// OpenAdKit runs on this Mac only, so it is refused when the dashboard is opened from another device.
async function Guard() {
  if (!isLocalHost((await headers()).get("host"))) {
    return (
      <div className="px-4 pt-10 max-w-md mx-auto text-center">
        <h1 className="text-xl font-semibold">OpenAdKit opens on your Mac only</h1>
        <p className="text-sm text-[#6b7280] mt-2">Open the dashboard on your Mac to use it.</p>
      </div>
    );
  }
  return <ToolFrame id="openadkit" about="Open-source AI marketing tool for ad copy and creative." keyNote="OpenAdKit needs its own AI provider key, set inside the tool." />;
}

export default function Page() {
  return (
    <Suspense>
      <Guard />
    </Suspense>
  );
}
