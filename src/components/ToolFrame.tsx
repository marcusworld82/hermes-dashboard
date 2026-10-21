"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Play, RotateCw } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Button, ErrorNote } from "./ui";

type Status = { id: string; name: string; url: string; built: boolean; running: boolean; configured: boolean | null; folder: string };

// Shows a local tool (Recast, OpenAdKit) inside the dashboard, with a Start button when it is stopped.
export function ToolFrame({ id, about, keyNote }: { id: string; about: string; keyNote: string }) {
  const { data, error, reload, setData } = useApi<Status>(`/api/tools/${id}`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [wide, setWide] = useState(true);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const check = () => setWide(window.innerWidth >= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const start = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setData(await api<Status>(`/api/tools/${id}`, { method: "POST" }));
    } catch (e) {
      setMsg((e as Error).message);
      reload();
    } finally {
      setBusy(false);
    }
  };

  if (!wide)
    return (
      <div className="px-4 pt-10 max-w-md mx-auto text-center">
        <h1 className="text-xl font-semibold">{data?.name ?? "This tool"} is a desktop screen</h1>
        <p className="text-sm text-[#6b7280] mt-2">It runs on your Mac. Open the dashboard there to use it.</p>
      </div>
    );

  return (
    <div className="h-dvh flex flex-col">
      <div className="flex items-center gap-2 px-4 h-14 border-b border-[#e8eaee]/80 bg-white/60 shrink-0">
        <span className="font-semibold">{data?.name ?? ""}</span>
        <span className="text-xs text-[#9ca3af] truncate hidden lg:block">{about}</span>
        {data?.running && (
          <>
            <button onClick={() => frame.current?.contentWindow?.location.reload()} aria-label="Reload" className="ml-auto w-9 h-9 rounded-xl flex items-center justify-center text-[#6b7280] hover:bg-white">
              <RotateCw size={15} />
            </button>
            <a href={data.url} target="_blank" rel="noreferrer" aria-label="Open in a new tab" className="w-9 h-9 rounded-xl flex items-center justify-center text-[#6b7280] hover:bg-white">
              <ExternalLink size={15} />
            </a>
          </>
        )}
      </div>
      {data?.running ? (
        <>
          {data.configured == null && <p className="text-xs bg-[#fef3c7] text-[#92400e] px-4 py-2">The tool is running. Its provider connection has not been verified.</p>}
          {data.configured === false && <p className="text-xs bg-[#fef3c7] text-[#92400e] px-4 py-2">{keyNote}</p>}
          <iframe ref={frame} src={data.url} title={data.name} className="flex-1 w-full border-0 bg-white" />
        </>
      ) : (
        <div className="p-10 max-w-lg">
          <ErrorNote text={error || msg} />
          {!data ? (
            <p className="text-sm text-[#9ca3af] flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Checking
            </p>
          ) : !data.built ? (
            <>
              <h2 className="font-semibold text-lg">{data.name} is not built</h2>
              <p className="text-sm text-[#6b7280] mt-2 break-all">Expected it in {data.folder}.</p>
            </>
          ) : (
            <>
              <h2 className="font-semibold text-lg">{data.name} is stopped</h2>
              <p className="text-sm text-[#6b7280] mt-2 mb-4">{about} It runs on your Mac at {data.url}. Start it here after a restart.</p>
              <Button onClick={start} disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Start {data.name}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
