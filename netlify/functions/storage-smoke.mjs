import crypto from 'node:crypto';
import {
  getDropboxAccessToken,
  ensureDropboxFolder,
  createDropboxFileRequest,
  listDropboxFolder,
  getDropboxTemporaryLink,
  deleteDropboxPath,
  dropboxRpc,
} from '../lib/dropbox.mjs';

const json = (status, body) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
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

  const body = await response.text();
  let data = {};
  try { data = body ? JSON.parse(body) : {}; } catch { data = { raw: body }; }

  if (!response.ok) {
    const detail = data?.error_summary || data?.error?.['.tag'] || response.statusText;
    throw new Error(`Dropbox file upload failed: ${detail}`);
  }
  return data;
}

export default async (request) => {
  if (!['GET', 'POST'].includes(request.method)) {
    return json(405, { error: 'Method not allowed.' });
  }

  const trigger = request.headers.get('x-mixedbyrashid-storage-smoke') || '';
  if (!safeEqual('storage-e2e-20260926-v1', trigger)) {
    return json(404, { error: 'Not found.' });
  }

  const root = '/MixedByRashid Smoke Tests';
  const runId = crypto.randomUUID().slice(0, 8);
  const project = `${root}/Run ${runId}`;
  const source = `${project}/01 Source`;
  const testPath = `${source}/storage-smoke.txt`;
  let requestId = null;

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
    const accessToken = await getDropboxAccessToken();
    checks.token_refresh = Boolean(accessToken);

    await ensureDropboxFolder(root, { accessToken });
    await ensureDropboxFolder(project, { accessToken });
    await ensureDropboxFolder(source, { accessToken });
    checks.folder_create = true;

    const fileRequest = await createDropboxFileRequest({
      title: `MixedByRashid Storage Smoke ${runId}`,
      destination: source,
      description: 'Temporary automated storage verification. Safe to ignore.',
    }, { accessToken });
    requestId = fileRequest.id;
    checks.file_request_create = Boolean(fileRequest.id && fileRequest.url);

    const payload = `MixedByRashid storage smoke ${runId}`;
    const uploaded = await uploadTextFile(testPath, payload, accessToken);
    checks.upload = uploaded?.['.tag'] === 'file' || Boolean(uploaded?.id);

    const entries = await listDropboxFolder(source, { accessToken });
    const file = entries.find((entry) =>
      entry?.['.tag'] === 'file' && entry.name === 'storage-smoke.txt'
    );
    checks.list = Boolean(file?.id);

    if (!file?.id) {
      throw new Error('Uploaded smoke file was not found in Dropbox listing.');
    }

    const temporary = await getDropboxTemporaryLink(file.id, { accessToken });
    if (!temporary?.link) throw new Error('Dropbox did not return a temporary link.');

    const download = await fetch(temporary.link);
    const downloadedText = await download.text();
    if (!download.ok || downloadedText !== payload) {
      throw new Error('Dropbox temporary download did not return the expected file.');
    }
    checks.temporary_download = true;
  } catch (error) {
    console.error('storage-smoke', error);
    failure = error;
  } finally {
    try {
      if (requestId) {
        await dropboxRpc('file_requests/update', {
          id: requestId,
          open: false,
        });
      }
    } catch (error) {
      console.warn('storage-smoke request close', error.message);
    }

    try {
      await deleteDropboxPath(project);
      checks.cleanup = true;
    } catch (error) {
      if (!/not_found/i.test(error.message)) {
        console.warn('storage-smoke cleanup', error.message);
      } else {
        checks.cleanup = true;
      }
    }
  }

  if (failure) {
    return json(500, {
      ok: false,
      checks,
      error: 'Storage smoke test failed.',
    });
  }

  return json(200, { ok: true, checks });
};

export const config = {
  path: '/api/storage-smoke',
};
