import {connection} from "next/server";
import { cutlineCloudStatus } from '../../../../../cloud/src/lib/server/cutline-cloud-status.mjs';
// Local Hermes read-only status mirror. No SDK import, storage check or dispatch.
export async function GET() {
 await connection();
  return Response.json(cutlineCloudStatus(), { headers: { 'Cache-Control': 'private, no-store' } });
}
