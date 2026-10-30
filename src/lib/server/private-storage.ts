import * as vercelBlob from '@vercel/blob';
import {configuredSupabaseBlob} from './hermes-storage.mjs';
/** Deliberately selected backend. Existing Blob data stays untouched. */
export function privateStorage():typeof vercelBlob {
 if(process.env.HERMES_STORAGE_PROVIDER==='supabase')return configuredSupabaseBlob() as unknown as typeof vercelBlob;
 return vercelBlob;
}
