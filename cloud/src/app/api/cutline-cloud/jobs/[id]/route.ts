import { cutlineCloudHTTP } from '@/lib/server/cutline-cloud-live';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return cutlineCloudHTTP(request, 'job', (await context.params).id); }
