import { handleUpload } from '@vercel/blob/client';
import { createCutlineDirectHTTP } from './cutline-cloud-direct.mjs';
import { createCutlineBlobBackend } from './cutline-cloud-store.mjs';
import { createCutlineProjects } from './cutline-cloud-projects.mjs';
export const cutlineCloudDirectHTTP = createCutlineDirectHTTP({
  handleUpload,
  async loadResources() {
    const blob = await import('@vercel/blob'); const backend = createCutlineBlobBackend({ blob, approvedBudget: undefined });
    return { blob, uploads: backend.uploads, projects: createCutlineProjects({ blob, repository: backend.repository }) };
  },
});
