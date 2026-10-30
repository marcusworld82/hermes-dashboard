import {privateStorage} from './private-storage';
import { createCutlineProjectHTTP } from './cutline-cloud-project-http.mjs';
import { createCutlineBlobBackend } from './cutline-cloud-store.mjs';
import { createCutlineProjects } from './cutline-cloud-projects.mjs';
import { cutlineCloudEditorHTML } from './cutline-cloud-editor.mjs';
import { loadCutlineTrustedAssets } from './cutline-cloud-assets.mjs';
export const cutlineCloudProjectHTTP = createCutlineProjectHTTP({
  async editorHTML() { let fonts: {family:string;file:string}[] = []; try { fonts = (await loadCutlineTrustedAssets()).fonts; } catch {} return cutlineCloudEditorHTML(fonts); },
  async fonts() { try { return (await loadCutlineTrustedAssets()).fonts.map(f => f.family); } catch { return []; } },
  async loadProjects() {
    const blob = privateStorage();
    const backend = createCutlineBlobBackend({ blob, approvedBudget: undefined });
    return createCutlineProjects({ blob, repository: backend.repository });
  },
});
