"use client";

import { ExternalLink } from "lucide-react";

// Local embedded tools cannot be reached from the cloud or another device.
export function ToolFrame({ id, about }: { id: string; about: string; keyNote: string }) {
  const name = id === "recast" ? "Recast" : id === "openadkit" ? "OpenAdKit" : "This tool";
  return (
    <div className="px-4 pt-10 max-w-md mx-auto text-center">
      <h1 className="text-xl font-semibold">{name} opens on your Mac</h1>
      <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">{about} Open Marcus OS on your Mac to use it.</p>
      <a href={`http://localhost:3200/${id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-white text-sm mt-5"><ExternalLink size={15} /> Open local Marcus OS</a>
    </div>
  );
}
