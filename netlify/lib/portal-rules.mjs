export const MAX_FILE_BYTES = 5 * 1024 ** 3;
export const MAX_ORDER_BYTES = 25 * 1024 ** 3;
export const STUDIO_RATE_CENTS = 6000;
export const MIN_STUDIO_HOURS = 2;
export const MAX_AUTO_STUDIO_HOURS = 12;
export const MIN_STUDIO_DEPOSIT_CENTS = 6000;

export function studioDepositCents(hours) {
  const h = Number(hours);
  if (!Number.isInteger(h) || h < MIN_STUDIO_HOURS || h > MAX_AUTO_STUDIO_HOURS) {
    throw new Error(`Studio hours must be an integer from ${MIN_STUDIO_HOURS} to ${MAX_AUTO_STUDIO_HOURS}.`);
  }
  const sessionTotal = h * STUDIO_RATE_CENTS;
  return Math.max(MIN_STUDIO_DEPOSIT_CENTS, Math.round(sessionTotal * 0.25));
}

export function servicePriceCents(service, quantity = 1) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 50) throw new Error('Quantity must be an integer from 1 to 50.');
  if (service === 'mixing') return 5000 * qty;
  if (service === 'mastering') return 2000 * qty;
  throw new Error('Unsupported service.');
}

export function assertUploadAllowed({ fileSize, currentProjectBytes }) {
  const size = Number(fileSize);
  const current = Number(currentProjectBytes);
  if (!Number.isFinite(size) || size <= 0) throw new Error('File size must be greater than zero.');
  if (size > MAX_FILE_BYTES) throw new Error('File exceeds the 5 GB per-file limit.');
  if (current + size > MAX_ORDER_BYTES) throw new Error('Project exceeds the 25 GB total upload limit.');
  return true;
}
