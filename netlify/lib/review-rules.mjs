export function normalizeTimestampMs(value) {
  const ms = Number(value || 0);
  if (!Number.isFinite(ms) || ms < 0 || ms > 24 * 60 * 60 * 1000) {
    throw new Error('Timestamp must be between 0 and 24 hours.');
  }
  return Math.round(ms);
}

export function normalizeReviewNote(value) {
  const note = String(value || '').trim();
  if (!note) throw new Error('Revision note is required.');
  if (note.length > 2000) throw new Error('Revision note must be 2000 characters or less.');
  return note;
}

export function normalizeVersionKey(value) {
  const key = String(value || '').trim();
  if (!key) throw new Error('A mix version is required.');
  if (key.length > 500) throw new Error('Mix version key is too long.');
  return key;
}

export function revisionAvailability({ includedRevisions = 0, revisionCount = 0 }) {
  const included = Math.max(0, Number(includedRevisions) || 0);
  const used = Math.max(0, Number(revisionCount) || 0);
  return {
    included,
    used,
    remaining: Math.max(0, included - used),
    extraPaymentRequired: used >= included,
  };
}

export function assertRevisionAvailable(values) {
  const availability = revisionAvailability(values);
  if (availability.extraPaymentRequired) {
    const error = new Error('Included revisions are used. Extra revision payment is required.');
    error.statusCode = 409;
    throw error;
  }
  return availability;
}

export function canApproveMix({ service, paymentStatus, versionKey }) {
  return (
    ['mixing', 'mastering'].includes(String(service || '')) &&
    paymentStatus === 'paid' &&
    Boolean(String(versionKey || '').trim())
  );
}

export function rmsMatchGains(rmsA, rmsB) {
  const a = Number(rmsA);
  const b = Number(rmsB);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
    return { a: 1, b: 1 };
  }
  const target = Math.min(a, b);
  return {
    a: Math.min(1, target / a),
    b: Math.min(1, target / b),
  };
}
