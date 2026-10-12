import { randomUUID } from 'node:crypto';

// This diagnostic uses only a new, uniquely named test folder. It never touches
// client projects, creates orders, or changes the customer storage enable flag.
export async function checkStorage(runtime, fetchImpl = fetch) {
  const checks = {};
  let stage = 'configuration';
  let token;
  let folderCreated = false;
  let requestId;
  const folder = `/MixedByRashid Storage Check ${randomUUID()}`;
  const file = `${folder}/check.txt`;
  const content = 'MixedByRashid storage verification\n';
  const call = async (url, options) => {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Provider request failed');
    return response;
  };
  const rpc = async (endpoint, body) => (await call(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })).json();
  try {
    if (!runtime.configured) throw new Error('Missing configuration');
    checks.configuration = true;
    stage = 'connection';
    const result = await (await call('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${runtime.appKey}:${runtime.appSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: runtime.refreshToken }),
    })).json();
    token = result.access_token;
    if (!token) throw new Error('No access token');
    checks.connection = true;
    stage = 'folder';
    await rpc('files/create_folder_v2', { path: folder, autorename: false });
    folderCreated = true;
    checks.folder = true;
    stage = 'upload';
    await call('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path: file, mode: 'add', autorename: false, mute: true }) }, body: content,
    });
    checks.upload = true;
    stage = 'listing';
    const listing = await rpc('files/list_folder', { path: folder });
    if (!listing.entries?.some(entry => entry.name === 'check.txt')) throw new Error('File missing');
    checks.listing = true;
    stage = 'download';
    const downloaded = await call('https://content.dropboxapi.com/2/files/download', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path: file }) },
    });
    if (await downloaded.text() !== content) throw new Error('Content mismatch');
    const link = await rpc('files/get_temporary_link', { path: file });
    if (!link.link) throw new Error('Download link missing');
    checks.download = true;
    stage = 'upload_request';
    const request = await rpc('file_requests/create', { title: 'MixedByRashid storage check', destination: folder, open: false });
    requestId = request.id;
    if (!requestId || request.is_open !== false) throw new Error('Invalid closed request');
    checks.upload_request = true;
  } catch {
    checks[stage] = false;
  } finally {
    if (folderCreated) {
      try {
        if (requestId) await rpc('file_requests/update', { id: requestId, open: false });
        await rpc('files/delete_v2', { path: folder });
        checks.cleanup = true;
      } catch { checks.cleanup = false; }
    }
  }
  return {
    ok: ['configuration', 'connection', 'folder', 'upload', 'listing', 'download', 'upload_request', 'cleanup'].every(key => checks[key] === true),
    storage_enabled: runtime.enabled,
    checks,
  };
}
