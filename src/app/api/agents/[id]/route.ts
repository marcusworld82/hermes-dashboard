import { handle } from "@/lib/server/http";
import { getAgent } from "@/lib/server/agents";
import { skillsFor } from "@/lib/server/skills";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => {
    const found = await getAgent(id);
    if (!found) throw new Error("Agent not found.");
    return { ...found, extraSkills: skillsFor(id) };
  });
}
