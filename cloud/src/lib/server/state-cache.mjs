/**
 * Coalesce storage reads and briefly cache failures. Private data remains behind
 * the existing authentication; this cache never becomes an unauthenticated API.
 * @template T
 * @param {() => Promise<T>} load
 * @param {{now?: () => number, ttlMs?: number}} options
 */
export function createStateCache(load, {now = Date.now, ttlMs = 60_000} = {}) {
 let version = 0, expiresAt = 0, ready = false;
 /** @type {T | undefined} */ let value;
 /** @type {unknown} */ let failure;
 /** @type {Promise<T> | null} */ let pending = null;
 return {
  /** @returns {Promise<T>} */
  async read() {
   if (ready && now() < expiresAt) {
    if (failure) throw failure;
    return /** @type {T} */ (value);
   }
   if (pending) return pending;
   const current = version;
   const request = Promise.resolve().then(load).then(result => {
    if (version === current) { value = result; failure = undefined; ready = true; expiresAt = now() + ttlMs; }
    return result;
   }, error => {
    if (version === current) { failure = error; ready = true; expiresAt = now() + ttlMs; }
    throw error;
   }).finally(() => { if (version === current) pending = null; });
   pending = request;
   return request;
  },
  /** @param {T} next */
  replace(next) { version++; value = next; failure = undefined; ready = true; expiresAt = now() + ttlMs; pending = null; },
 };
}
