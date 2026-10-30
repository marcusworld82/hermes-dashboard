import { cutlineCloudProjectHTTP } from '@/lib/server/cutline-cloud-project-live';
export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) { return cutlineCloudProjectHTTP(request, 'library', undefined, (await context.params).kind); }
export async function POST(request: Request, context: { params: Promise<{ kind: string }> }) { return cutlineCloudProjectHTTP(request, 'library-save', undefined, (await context.params).kind); }
