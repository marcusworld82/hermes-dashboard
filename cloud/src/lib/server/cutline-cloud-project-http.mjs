import { CutlineError } from './cutline-cloud-core.mjs';
import { cutlineCloudOwner } from './cutline-cloud-http.mjs';
import { cutlineCloudConfig } from './cutline-cloud-status.mjs';
import { readBoundedBody } from './cutline-cloud-media.mjs';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export function createCutlineProjectHTTP({ env = process.env, loadProjects, editorHTML, fonts = async () => /** @type {string[]} */ ([])  }) {
  return async function handle(request, action, id, kind) {
    try {
      const owner = cutlineCloudOwner(request, env); const config = cutlineCloudConfig(env);
      if (!config.storage || !config.storageCredentials) throw new CutlineError('PRIVATE_STORAGE_REQUIRED', 'Cloud editing requires restored private Blob capacity and explicit storage configuration. Nothing was saved.', 503);
      if (action === 'editor') return new Response(await editorHTML(), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; media-src 'self' blob:; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'", 'Referrer-Policy': 'no-referrer' } });
      if (action === 'fonts') return Response.json({ fonts: await fonts() }, { headers });
      const projects = await loadProjects();
      if (action === 'list') return Response.json({ projects: await projects.list(owner) }, { headers });
      if (action === 'create') {
        if (!config.uploads) throw new CutlineError('UPLOADS_DISABLED', 'The owner has not enabled cloud video ingestion.', 503);
        const result = await projects.create(owner, await readBoundedBody(request), request.headers.get('content-type'), new URL(request.url).searchParams.get('name'));
        return Response.json(result, { status: 201, headers });
      }
      if (action === 'load') return Response.json(await projects.load(owner, id), { headers });
      if (action === 'save' || action === 'library-save') {
        if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) throw new CutlineError('CONTENT_TYPE', 'Use application/json.', 415);
        let value; try { value = JSON.parse((await readBoundedBody(request, action === 'save' ? 1024 * 1024 : 65536)).toString('utf8')); } catch (error) { if (error instanceof CutlineError) throw error; throw new CutlineError('INVALID_JSON', 'Invalid JSON.'); }
        if (action === 'save') { if (!value || Object.keys(value).some(k => !['baseRevision', 'doc'].includes(k))) throw new CutlineError('INVALID_REQUEST', 'Expected baseRevision and doc.'); return Response.json(await projects.save(owner, id, value.baseRevision, value.doc), { headers }); }
        return Response.json({ item: await projects.saveLibrary(owner, kind, value) }, { headers });
      }
      if (action === 'library') return Response.json({ items: await projects.library(owner, kind) }, { headers });
      if (action === 'source') return projects.source(owner, id, request.headers.get('range'));
      if (action === 'srt') return new Response(await projects.srt(owner, id), { headers: { ...headers, 'Content-Type': 'application/x-subrip; charset=utf-8', 'Content-Disposition': 'attachment; filename="captions.srt"' } });
      throw new CutlineError('NOT_FOUND', 'Unknown cloud editing operation.', 404);
    } catch (error) {
      if (error instanceof CutlineError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
      return Response.json({ error: 'Private project storage is unavailable. Changes were not saved; do not close the editor until storage is restored.', code: 'PROJECT_STORAGE_UNAVAILABLE' }, { status: 503, headers });
    }
  };
}
