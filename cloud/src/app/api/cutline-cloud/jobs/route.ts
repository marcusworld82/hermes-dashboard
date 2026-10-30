import { cutlineCloudHTTP } from '@/lib/server/cutline-cloud-live';
export async function POST(request: Request) { return cutlineCloudHTTP(request, 'enqueue'); }
