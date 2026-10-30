import {sameOrigin} from '@/lib/server/security.mjs';
// Cached login forms remain harmless: no password is read and no session minted.
export function POST(request:Request){if(!sameOrigin(request.headers.get('origin'),request.headers.get('host')))return new Response('Invalid origin',{status:403});return Response.redirect(new URL('/dashboard',request.url),303)}
