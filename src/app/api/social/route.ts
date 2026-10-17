import { handle } from "@/lib/server/http";
import { readSocial } from "@/lib/server/social";
import { paths } from "@/lib/server/paths";

export async function GET() {
  return handle(() => ({ ...readSocial(), crmUrl: paths.crmUrl }));
}
