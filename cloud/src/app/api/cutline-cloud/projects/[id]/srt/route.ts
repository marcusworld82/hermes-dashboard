import { cutlineCloudProjectHTTP } from '@/lib/server/cutline-cloud-project-live';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return cutlineCloudProjectHTTP(request, 'srt', (await context.params).id); }
