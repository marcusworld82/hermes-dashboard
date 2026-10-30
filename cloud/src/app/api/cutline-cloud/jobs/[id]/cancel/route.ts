import { cutlineCloudHTTP } from '@/lib/server/cutline-cloud-live';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return cutlineCloudHTTP(request, 'cancel', (await context.params).id); }
