import { cutlineCloudProjectHTTP } from '@/lib/server/cutline-cloud-project-live';
export async function GET(request: Request) { return cutlineCloudProjectHTTP(request, 'editor'); }
