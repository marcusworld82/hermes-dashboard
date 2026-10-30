import { cutlineCloudHTTP } from '@/lib/server/cutline-cloud-live';
export const maxDuration = 300;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return cutlineCloudHTTP(request, 'dispatch', (await context.params).id); }
