import { handle } from "@/lib/server/http";
import { postizClient, postizReady } from "@/lib/server/postiz";

export async function GET() {
  return handle(async () => {
    if (!postizReady()) return { ready: false, channels: [], reason: "Add POSTIZ_API_KEY to .env.local, then restart Hermes." };
    return { ready: true, channels: (await postizClient().channels()).filter((c) => !c.disabled), reason: null };
  });
}
