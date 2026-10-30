// Explicit owner authorization: Hermes opens to anyone with its link.
// Provider credentials, bridge authentication and signed artifact delivery remain separate.
export const LINK_PUBLIC_ACCESS = true;
export const PUBLIC_PAID_GENERATION_ENABLED = false;
export function linkPublicWriteRestriction(path, method, body) {
 if (['GET','HEAD','OPTIONS'].includes(method)) return null;
 path=path.replace(/\/+$/,'');
 if(path==='/api/connections'||path.startsWith('/api/composio/'))return 'Provider and credential setup remains owner-managed.';
 if (/^\/api\/creative-studio\/(quote|jobs)$/.test(path) || /^\/api\/cutline-cloud\/jobs(?:\/[^/]+\/dispatch)?$/.test(path) || /^\/api\/social\/(images|covers|render|previews)$/.test(path) || /^\/api\/social\/carousels\/[^/]+\/generate$/.test(path)) return 'Paid generation remains disabled.';
 if (/^\/api\/social\/postiz(?:\/|$)/.test(path) || /^\/api\/social\/carousels\/[^/]+\/post$/.test(path) || path==='/api/social/studio'&&body?.action==='publish' || /^\/api\/social\/content\/[^/]+$/.test(path)&&['approve','schedule','resolve-publication'].includes(body?.action)) return 'Social publishing remains disconnected.';
 if (/^\/api\/social\/content\/[^/]+$/.test(path)&&['research','script','build','cover'].includes(body?.action) || path==='/api/discovery'&&['start','resume'].includes(body?.action)) return 'Paid generation and discovery remain disabled.';
 return null;
}
export function publicActionBodyRequired(path,method){return method==='POST'&&(path==='/api/social/studio'||path==='/api/discovery'||/^\/api\/social\/content\/[^/]+$/.test(path))}
