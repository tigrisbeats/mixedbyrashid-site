import crypto from 'node:crypto';
import {
  ensureDropboxFolder,
  createDropboxFileRequest,
  listDropboxFolder,
  getDropboxTemporaryLink,
  deleteDropboxPath,
  dropboxRpc,
} from '../lib/dropbox.mjs';

const ROUTE_KEY_HASH = '389c7dcf5923050abe5958694fd5f0236aa28c55c2abba66a40d227b51e79f88';

const json = (status, body) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function refreshDropboxToken() {
  const appKey = String(Netlify.env.get('DROPBOX_APP_KEY') || 'tu7seery1let8fv').trim();
  const appSecret = String(Netlify.env.get('DROPBOX_APP_SECRET') || '').trim();
  const refreshToken = String(Netlify.env.get('DROPBOX_REFRESH_TOKEN') || '').trim();

  if (!appKey || !appSecret || !refreshToken) {
    throw new Error('Dropbox credentials are not fully configured.');
  }

  const auth = Buffer.from(`${appKey}:${appSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
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

  const data = await response.json();
  if (!data.access_token) throw new Error('Dropbox did not return an access token.');
  return data.access_token;
}

async function uploadTextFile(path, text, accessToken) {
  const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path,
        mode: 'add',
        autorename: false,
        mute: true,
        strict_conflict: true,
      }),
    },
    body: text,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error_summary || data?.error?.['.tag'] || response.statusText;
    throw new Error(`Dropbox file upload failed: ${detail}`);
  }
  return data;
}

export default async (request) => {
  if (request.method !== 'GET') {
    return json(405, { error: 'Method not allowed.' });
  }

  const url = new URL(request.url);
  const suppliedHash = crypto
    .createHash('sha256')
    .update(String(url.searchParams.get('key') || ''))
    .digest('hex');

  if (!safeEqual(ROUTE_KEY_HASH, suppliedHash)) {
    return json(404, { error: 'Not found.' });
  }

  const root = '/MixedByRashid Runtime Verification';
  const runId = crypto.randomUUID().slice(0, 8);
  const project = `${root}/Run ${runId}`;
  const source = `${project}/01 Source`;
  const filePath = `${source}/runtime-smoke.txt`;
  let accessToken = '';
  let requestId = '';

  const checks = {
    token_refresh: false,
    folder_create: false,
    file_request_create: false,
    upload: false,
    list: false,
    temporary_download: false,
    cleanup: false,
  };

  let failure = null;

  try {
    accessToken = await refreshDropboxToken();
    checks.token_refresh = true;

    await ensureDropboxFolder(root, { accessToken });
    await ensureDropboxFolder(project, { accessToken });
    await ensureDropboxFolder(source, { accessToken });
    checks.folder_create = true;

    const fileRequest = await createDropboxFileRequest({
      title: `MixedByRashid Runtime Verification ${runId}`,
      destination: source,
      description: 'Temporary automated storage verification.',
    }, { accessToken });
    requestId = fileRequest.id || '';
    checks.file_request_create = Boolean(fileRequest.id && fileRequest.url);

    const payload = `MixedByRashid runtime storage verification ${runId}`;
    const uploaded = await uploadTextFile(filePath, payload, accessToken);
    checks.upload = Boolean(uploaded?.id);

    const entries = await listDropboxFolder(source, { accessToken });
    const file = entries.find((entry) =>
      entry?.['.tag'] === 'file' && entry.name === 'runtime-smoke.txt'
    );
    checks.list = Boolean(file?.id);
    if (!file?.id) throw new Error('Uploaded test file was not found.');

    const temporary = await getDropboxTemporaryLink(file.id, { accessToken });
    if (!temporary?.link) throw new Error('Dropbox did not return a temporary link.');

    const download = await fetch(temporary.link);
    const downloadedText = await download.text();
    if (!download.ok || downloadedText !== payload) {
      throw new Error('Temporary download did not match the uploaded file.');
    }
    checks.temporary_download = true;
  } catch (error) {
    failure = error;
    console.error('storage-runtime-e2e', error);
  } finally {
    if (accessToken) {
      if (requestId) {
        try {
          await dropboxRpc('file_requests/update', {
            id: requestId,
            open: false,
          }, { accessToken });
        } catch (error) {
          console.warn('storage-runtime-e2e close request', error.message);
        }
      }

      try {
        await deleteDropboxPath(project, { accessToken });
        checks.cleanup = true;
      } catch (error) {
        if (/not_found/i.test(error.message)) {
          checks.cleanup = true;
        } else {
          console.warn('storage-runtime-e2e cleanup', error.message);
        }
      }
    }
  }

  if (failure) {
    return json(500, { ok: false, checks, error: 'Dropbox runtime verification failed.' });
  }

  return json(200, { ok: true, checks });
};

export const config = {
  path: '/api/_storage-e2e-5ef4417ac6d2b393c4f1fdf1',
};
