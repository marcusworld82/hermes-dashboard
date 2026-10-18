import { handle, body } from "@/lib/server/http";
import { quote, HF_MODELS, higgsfieldReady, type HfModelId } from "@/lib/server/higgsfield";
import type { Size } from "@/lib/carousel/types";

// Free price check. Nothing is generated here.
export async function GET() {
  return handle(() => ({ ready: higgsfieldReady(), models: HF_MODELS.map((m) => ({ id: m.id, name: m.name })) }));
}

export async function POST(req: Request) {
  const b = await body<{ model?: HfModelId; prompt?: string; size?: Size; count?: number }>(req);
  return handle(async () => {
    const q = await quote(b.model as HfModelId, String(b.prompt ?? ""), b.size === "4:5" ? "4:5" : "3:4");
    const count = Math.max(1, Math.min(10, Number(b.count) || 1));
    return { quote: q, count, totalUsd: q.usd === null ? null : Math.round(q.usd * count * 1000) / 1000, totalCredits: q.credits === null ? null : Math.round(q.credits * count * 1000) / 1000 };
  });
}
