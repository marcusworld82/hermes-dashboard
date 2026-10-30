import { cutlineCloudProjectHTTP } from '@/lib/server/cutline-cloud-project-live';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return cutlineCloudProjectHTTP(request, 'load', (await context.params).id); }
export async function PUT(request: Request, context: Context) { return cutlineCloudProjectHTTP(request, 'save', (await context.params).id); }
