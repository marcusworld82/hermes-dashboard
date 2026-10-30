import { connection } from "next/server";
import { liveStudioStatus, studioJSON } from "@/lib/server/creative-studio-runtime";
export async function GET() {
  await connection(); return studioJSON(await liveStudioStatus()); }
