import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_UPLOAD_LIMIT_BYTES,
  DROPBOX_PLUS_FILE_REQUEST_MAX_BYTES,
  safePathPart,
  stableClientKey,
  clientFolderPath,
  projectFolderPath,
  projectSubfolders,
  assertDropboxFileRequestUpload,
  cleanupAfter,
} from '../netlify/lib/storage-rules.mjs';

test('safePathPart strips Dropbox-hostile path characters', () => {
  assert.equal(safePathPart('  Song: One / Final?  '), 'Song One Final');
});

test('client folder is stable for returning clients', () => {
  const one = clientFolderPath({
    displayName: 'Artist One',
    userId: 'user-123',
    email: 'artist@example.com',
  });
  const two = clientFolderPath({
    displayName: 'Artist One',
    userId: 'user-123',
    email: 'artist@example.com',
  });
  assert.equal(one, two);
  assert.match(one, /^\/MixedByRashid Clients\/Artist One \[[a-f0-9]{10}\]$/);
});

test('client key does not expose the raw account id', () => {
  const key = stableClientKey({ userId: 'private-user-id', email: 'x@y.com' });
  assert.equal(key.length, 10);
  assert.equal(key.includes('private'), false);
});

test('project folders are unique by order id', () => {
  const base = '/MixedByRashid Clients/Artist [1234567890]';
  const a = projectFolderPath({ clientFolder: base, projectName: 'Single', orderId: 'aaaaaaaa-1111' });
  const b = projectFolderPath({ clientFolder: base, projectName: 'Single', orderId: 'bbbbbbbb-2222' });
  assert.notEqual(a, b);
});

test('project subfolder layout is consistent', () => {
  const folders = projectSubfolders('/root/project');
  assert.equal(folders.source, '/root/project/01 Stems & Source');
  assert.equal(folders.references, '/root/project/02 Reference Tracks');
  assert.equal(folders.finalDelivery, '/root/project/05 Final Delivery');
});

test('Dropbox Plus file request constraint is separate from project quota', () => {
  assert.equal(DROPBOX_PLUS_FILE_REQUEST_MAX_BYTES, 2 * 1024 ** 3);
  assert.equal(PROJECT_UPLOAD_LIMIT_BYTES, 25 * 1024 ** 3);
  assert.equal(
    assertDropboxFileRequestUpload({
      fileSize: 1024 ** 3,
      currentProjectBytes: 20 * 1024 ** 3,
    }),
    true
  );
});

test('Dropbox Plus file request rejects files over its provider ceiling', () => {
  assert.throws(
    () => assertDropboxFileRequestUpload({
      fileSize: 2 * 1024 ** 3 + 1,
      currentProjectBytes: 0,
    }),
    /2 GB/
  );
});

test('project quota rejects aggregate uploads beyond 25 GB', () => {
  assert.throws(
    () => assertDropboxFileRequestUpload({
      fileSize: 1024 ** 3,
      currentProjectBytes: 25 * 1024 ** 3,
    }),
    /25 GB/
  );
});

test('cleanup date is calculated from project completion', () => {
  const date = cleanupAfter('2026-09-01T12:00:00Z', 30);
  assert.equal(date.toISOString(), '2026-10-01T12:00:00.000Z');
});
