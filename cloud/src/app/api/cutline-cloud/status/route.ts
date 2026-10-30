import { cutlineCloudHTTP } from '@/lib/server/cutline-cloud-live';
export async function GET(request: Request) { return cutlineCloudHTTP(request, 'status'); }
