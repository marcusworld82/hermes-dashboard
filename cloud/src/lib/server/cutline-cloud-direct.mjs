import { randomUUID } from 'node:crypto';
import { CutlineError, readBoundedJson } from './cutline-cloud-core.mjs';
import { cutlineCloudOwner } from './cutline-cloud-http.mjs';
import { cutlineCloudConfig } from './cutline-cloud-status.mjs';
import { DIRECT_UPLOAD_BYTES } from './cutline-cloud-media.mjs';
import { sourcePath } from './cutline-cloud-projects.mjs';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export function createCutlineDirectHTTP({ env = process.env, loadResources, handleUpload, now = Date.now, makeId = randomUUID }) {
  return async function handle(request, action) {
    let resources; let claimed;
    try {
      const owner = cutlineCloudOwner(request, env); const config = cutlineCloudConfig(env);
      if (!config.storage || !config.storageCredentials || !config.uploads || !config.directUploads) throw new CutlineError('DIRECT_UPLOAD_DISABLED', 'Direct uploads need explicit owner enablement, existing private storage capacity and the existing Blob read/write credential.', 503);
      const body = await readBoundedJson(request); resources = await loadResources();
      if (action === 'prepare') {
        if (!body || Object.keys(body).some(k => !['name', 'size', 'contentType'].includes(k)) || body.contentType !== 'video/mp4' || !Number.isSafeInteger(body.size) || body.size < 32 || body.size > DIRECT_UPLOAD_BYTES || typeof body.name !== 'string' || body.name.length > 200) throw new CutlineError('INVALID_UPLOAD', 'Choose an MP4 up to 128 MiB.');
        const projectId = makeId(); const id = makeId(); const record = { id, projectId, owner, path: sourcePath(owner, projectId), name: body.name, size: body.size, contentType: 'video/mp4', state: 'pending', createdAt: now(), expiresAt: now() + 15 * 60000 };
        if(resources.signUpload)record.objectPath='objects/'+makeId();
        await resources.uploads.create(record);
        if(resources.signUpload){await resources.uploads.issue(owner,id,record.path);const signedUploadUrl=await resources.signUpload(record.objectPath);return Response.json({uploadId:id,signedUploadUrl,expiresAt:record.expiresAt,maxBytes:DIRECT_UPLOAD_BYTES},{status:201,headers});}
        return Response.json({ uploadId: id, pathname: record.path, expiresAt: record.expiresAt, maxBytes: DIRECT_UPLOAD_BYTES }, { status: 201, headers });
      }
      if (action === 'token') {
        if (body?.type !== 'blob.generate-client-token' || !body.payload || Object.keys(body).some(k => !['type', 'payload'].includes(k)) || Object.keys(body.payload).some(k => !['pathname', 'clientPayload', 'multipart'].includes(k)) || typeof body.payload.clientPayload !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(body.payload.clientPayload)) throw new CutlineError('INVALID_TOKEN_REQUEST', 'Only authenticated upload token generation is supported. No callback route exists.');
        const result = await handleUpload({ request, body, token: env.BLOB_READ_WRITE_TOKEN, onBeforeGenerateToken: async (pathname, clientPayload) => {
          const record = await resources.uploads.issue(owner, clientPayload, pathname);
          return { allowedContentTypes: ['video/mp4'], maximumSizeInBytes: record.size, validUntil: Math.min(record.expiresAt, now() + 10 * 60000), addRandomSuffix: false, allowOverwrite: false, tokenPayload: record.id };
        } });
        return Response.json(result, { headers });
      }
      if (action === 'finalize') {
        if (!body || Object.keys(body).length !== 1 || !/^[a-zA-Z0-9_-]{1,64}$/.test(body.uploadId)) throw new CutlineError('INVALID_UPLOAD', 'Expected one owned upload identifier.');
        const existing = await resources.uploads.get(owner, body.uploadId);
        if (existing.state === 'attached') return Response.json(await resources.projects.load(owner, existing.projectId), { headers });
        claimed = await resources.uploads.claim(owner, body.uploadId);
        // Resolve only the durable server allocation; never accept a URL/path here.
        if (claimed.path !== sourcePath(owner, claimed.projectId)) throw new CutlineError('UPLOAD_OWNERSHIP', 'Upload path is invalid.');
        if(resources.registerUpload)await resources.registerUpload(claimed.path,claimed.objectPath,claimed.size);
        const metadata = await resources.blob.head(claimed.path);
        if (metadata.pathname !== claimed.path || metadata.size !== claimed.size || metadata.size > DIRECT_UPLOAD_BYTES || metadata.contentType?.split(';')[0] !== 'video/mp4') throw new CutlineError('INVALID_UPLOAD', 'Uploaded MIME, size or private path did not match its allocation.', 415);
        const bytes = await resources.projects.readPrivate(claimed.path, DIRECT_UPLOAD_BYTES);
        if (bytes.length !== claimed.size) throw new CutlineError('INVALID_UPLOAD', 'Private upload bytes did not match the allocation size.', 415);
        const project = await resources.projects.create(owner, bytes, metadata.contentType, claimed.name, claimed);
        await resources.uploads.finish(owner, claimed.id, { state: 'attached', attachedAt: now() }); claimed = undefined;
        return Response.json(project, { status: 201, headers });
      }
      throw new CutlineError('INVALID_ACTION', 'Unknown upload action.', 404);
    } catch (error) {
      if (claimed && resources) { try { await resources.uploads.finish(claimed.owner, claimed.id, { state: 'quarantined', errorCode: error instanceof CutlineError ? error.code : 'UPLOAD_VALIDATION_FAILED' }); } catch {} }
      if (error instanceof CutlineError) return Response.json({ code: error.code, error: error.message }, { status: error.status, headers });
      return Response.json({ code: 'UPLOAD_UNAVAILABLE', error: 'Private upload storage is unavailable. Uploaded bytes remain private and unattached; no render was started.' }, { status: 503, headers });
    }
  };
}
