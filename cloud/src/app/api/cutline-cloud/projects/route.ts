import { cutlineCloudProjectHTTP } from '@/lib/server/cutline-cloud-project-live';
export const maxDuration = 60;
export async function GET(request: Request) { return cutlineCloudProjectHTTP(request, 'list'); }
export async function POST(request: Request) { return cutlineCloudProjectHTTP(request, 'create'); }
