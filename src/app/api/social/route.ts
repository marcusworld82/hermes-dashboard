import { handle } from "@/lib/server/http";
import { readSocial } from "@/lib/server/social";
import { paths } from "@/lib/server/paths";
import path from "node:path";
import { readSocialPlan } from "@/lib/server/social-plan";

export async function GET() {
  return handle(() => ({ ...readSocial(), crmUrl: paths.crmUrl, planning: readSocialPlan(path.join(paths.data, "social-content-plan.json")) }));
}
