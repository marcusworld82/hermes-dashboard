"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, RotateCw } from "lucide-react";

const TABS = [
  { path: "/", label: "Dashboard" },
  { path: "/leads", label: "Leads" },
  { path: "/sales", label: "Sales" },
  { path: "/inbox", label: "Inbox" },
  { path: "/social", label: "Social" },
  { path: "/calendar", label: "Calendar" },
  { path: "/settings", label: "Settings" },
];

export function CrmFrame({ url }: { url: string }) {
  const [path, setPath] = useState("/");
  const [up, setUp] = useState<boolean | null>(null);
  const [wide, setWide] = useState(true);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const check = () => setWide(window.innerWidth >= 768);
    check();
    window.addEventListener("resize", check);
    fetch(url, { mode: "no-cors" })
      .then(() => setUp(true))
      .catch(() => setUp(false));
    return () => window.removeEventListener("resize", check);
  }, [url]);

  if (!wide)
    return (
      <div className="px-4 pt-10 max-w-md mx-auto text-center">
        <h1 className="text-xl font-semibold">The CRM is a desktop screen</h1>
        <p className="text-sm text-[#6b7280] mt-2">Open the dashboard on your Mac to use Leads, Sales and Inbox.</p>
      </div>
    );

  return (
    <div className="h-dvh flex flex-col">
      <div className="flex items-center gap-1 px-4 h-14 border-b border-[#e8eaee]/80 bg-white/60 shrink-0">
        <span className="font-semibold mr-3">CRM</span>
        {TABS.map((t) => (
          <button key={t.path} onClick={() => setPath(t.path)} className={`min-h-9 px-3 rounded-xl text-[13px] font-medium ${path === t.path ? "bg-[#1a1d24] text-white" : "text-[#6b7280] hover:bg-white"}`}>
            {t.label}
          </button>
        ))}
        <button onClick={() => frame.current?.contentWindow?.location.reload()} aria-label="Reload" className="ml-auto w-9 h-9 rounded-xl flex items-center justify-center text-[#6b7280] hover:bg-white">
          <RotateCw size={15} />
        </button>
        <a href={`${url}${path}`} target="_blank" rel="noreferrer" aria-label="Open in a new tab" className="w-9 h-9 rounded-xl flex items-center justify-center text-[#6b7280] hover:bg-white">
          <ExternalLink size={15} />
        </a>
      </div>
      {up === false ? (
        <div className="p-10 max-w-lg">
          <h2 className="font-semibold text-lg">The CRM is not running</h2>
          <p className="text-sm text-[#6b7280] mt-2">Start it in Terminal, then reload this page:</p>
          <pre className="mt-3 text-xs bg-white border border-[#e8eaee] rounded-2xl p-3 whitespace-pre-wrap">cd ~/Desktop/&quot;Content and Outreach App&quot;/app && npm run dev</pre>
        </div>
      ) : (
        <iframe ref={frame} key={path} src={`${url}${path}`} title="CRM" className="flex-1 w-full border-0 bg-white" />
      )}
    </div>
  );
}
