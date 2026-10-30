import { cutlineCloudDirectHTTP } from '@/lib/server/cutline-cloud-direct-live';
export const maxDuration = 60;
export async function POST(request: Request) { return cutlineCloudDirectHTTP(request, 'prepare'); }
