import crypto from 'node:crypto';

export const PROJECT_UPLOAD_LIMIT_BYTES = 25 * 1024 ** 3;

// Dropbox Plus File Requests currently cap each contributed file below the
// portal's preferred 5 GB ceiling. Keep this provider constraint separate
// from the business-level project quota so the storage provider can be
// upgraded later without rewriting project rules.
export const DROPBOX_PLUS_FILE_REQUEST_MAX_BYTES = 2 * 1024 ** 3;

export const DEFAULT_RETENTION_DAYS = Number(
  process.env.PORTAL_RETENTION_DAYS || 30
);

export function safePathPart(value, fallback = 'Untitled') {
  const cleaned = String(value || '')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  return (cleaned || fallback).slice(0, 80);
}

export function stableClientKey({ userId, email }) {
  const source = String(userId || email || '').trim().toLowerCase();
  if (!source) throw new Error('A user id or email is required.');
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 10);
}

export function shortOrderKey(orderId) {
  const value = String(orderId || '').replace(/[^a-zA-Z0-9]/g, '');
  if (!value) throw new Error('Order id is required.');
  return value.slice(0, 8).toUpperCase();
}

export function clientFolderPath({ displayName, userId, email }) {
  const name = safePathPart(displayName || email?.split('@')[0], 'Client');
  return `/MixedByRashid Clients/${name} [${stableClientKey({ userId, email })}]`;
}

export function projectFolderPath({ clientFolder, projectName, orderId }) {
  if (!clientFolder?.startsWith('/')) throw new Error('Client folder is required.');
  const project = safePathPart(projectName, 'Project');
  return `${clientFolder}/${project} [${shortOrderKey(orderId)}]`;
}

export function projectSubfolders(projectFolder) {
  return {
    source: `${projectFolder}/01 Stems & Source`,
    references: `${projectFolder}/02 Reference Tracks`,
    roughMixes: `${projectFolder}/03 Rough Mixes`,
    revisions: `${projectFolder}/04 Revisions`,
    finalDelivery: `${projectFolder}/05 Final Delivery`,
  };
}

export function assertDropboxFileRequestUpload({ fileSize, currentProjectBytes = 0 }) {
  const size = Number(fileSize);
  const current = Number(currentProjectBytes);

  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('File size must be greater than zero.');
  }
  if (size > DROPBOX_PLUS_FILE_REQUEST_MAX_BYTES) {
    throw new Error('This Dropbox Plus upload route supports files up to 2 GB each.');
  }
  if (current + size > PROJECT_UPLOAD_LIMIT_BYTES) {
    throw new Error('Project exceeds the 25 GB total upload limit.');
  }
  return true;
}

export function cleanupAfter(completedAt, retentionDays = DEFAULT_RETENTION_DAYS) {
  const completed = new Date(completedAt);
  const days = Number(retentionDays);
  if (Number.isNaN(completed.getTime())) throw new Error('Valid completion date required.');
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error('Retention days must be an integer from 1 to 365.');
  }

  return new Date(completed.getTime() + days * 86400000);
}
