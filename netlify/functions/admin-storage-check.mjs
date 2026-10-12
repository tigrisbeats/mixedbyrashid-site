import { portalUser, isPortalAdmin, verifyPortalMutation } from '../lib/auth.mjs';
import { storageRuntimeConfig } from '../lib/runtime-config.mjs';
import { checkStorage } from '../lib/storage-check.mjs';

export function createStorageCheckHandler({ user = portalUser, admin = isPortalAdmin, runtime = storageRuntimeConfig, check = checkStorage } = {}) {
  return async request => {
    const json = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
    try {
      if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
      verifyPortalMutation(request);
      if (!admin(await user())) return json(403, { error: 'Admin access required.' });
      return json(200, await check(runtime()));
    } catch (error) {
      const status = [401, 403].includes(error.statusCode) ? error.statusCode : 500;
      return json(status, { error: status === 500 ? 'Storage check could not complete.' : 'Owner authentication and a same-site request are required.' });
    }
  };
}
export default createStorageCheckHandler();
export const config = { path: '/api/admin-storage-check', rateLimit: { action: 'rate_limit', aggregateBy: ['domain', 'ip'], windowSize: 60, windowLimit: 2 } };
