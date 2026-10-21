import { handle } from "@/lib/server/http";
import { tickWorkflowSchedules } from "@/lib/server/workflows";

// Called by the local supervisor. GET never creates work.
export async function POST() {
  return handle(() => tickWorkflowSchedules());
}
