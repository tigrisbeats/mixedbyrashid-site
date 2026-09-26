const API = 'https://api.dropboxapi.com/2';

function requireEnv(name) {
  const value = Netlify.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function getDropboxAccessToken(fetchImpl = fetch) {
  const appKey = requireEnv('DROPBOX_APP_KEY');
  const appSecret = requireEnv('DROPBOX_APP_SECRET');
  const refreshToken = requireEnv('DROPBOX_REFRESH_TOKEN');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const auth = Buffer.from(`${appKey}:${appSecret}`).toString('base64');
  const response = await fetchImpl('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Dropbox token refresh failed (${response.status}).`);
  }

  const json = await response.json();
  if (!json.access_token) throw new Error('Dropbox did not return an access token.');
  return json.access_token;
}

export async function dropboxRpc(endpoint, payload, {
  fetchImpl = fetch,
  accessToken,
} = {}) {
  const token = accessToken || await getDropboxAccessToken(fetchImpl);
  const response = await fetchImpl(`${API}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

  if (!response.ok) {
    const detail = json?.error_summary || json?.error?.['.tag'] || response.statusText;
    throw new Error(`Dropbox ${endpoint} failed: ${detail}`);
  }
  return json;
}

export async function ensureDropboxFolder(path, options = {}) {
  try {
    return await dropboxRpc('files/create_folder_v2', { path, autorename: false }, options);
  } catch (error) {
    if (/conflict/i.test(error.message)) return { metadata: { path_display: path }, existed: true };
    throw error;
  }
}

export async function createDropboxFileRequest({ title, destination, description }, options = {}) {
  return dropboxRpc('file_requests/create', {
    title,
    destination,
    open: true,
    description: description || '',
  }, options);
}

export async function deleteDropboxPath(path, options = {}) {
  return dropboxRpc('files/delete_v2', { path }, options);
}


export async function listDropboxFolder(path, options = {}) {
  const entries = [];
  let page = await dropboxRpc('files/list_folder', {
    path,
    recursive: false,
    include_deleted: false,
    include_media_info: false,
    include_mounted_folders: true,
  }, options);

  entries.push(...(page.entries || []));
  while (page.has_more) {
    page = await dropboxRpc('files/list_folder/continue', {
      cursor: page.cursor,
    }, options);
    entries.push(...(page.entries || []));
  }
  return entries;
}

export async function getDropboxTemporaryLink(path, options = {}) {
  return dropboxRpc('files/get_temporary_link', { path }, options);
}
