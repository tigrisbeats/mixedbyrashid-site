export const ROYALTY_AGREEMENT_STATUSES = new Set([
  'not_required',
  'draft',
  'pending_client',
  'pending_admin',
  'executed',
  'void',
]);

export const ROYALTY_AGREEMENT_TYPES = new Set([
  'mixer_points',
  'producer_points',
  'songwriting_split',
  'soundexchange_lod',
  'custom',
]);

export function normalizePercent(value, field = 'percentage') {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`${field} must be between 0 and 100.`);
  }
  return Math.round(n * 10000) / 10000;
}

export function validateParticipant(participant = {}) {
  if (!String(participant.legalName || '').trim()) throw new Error('Participant legal name is required.');
  if (!String(participant.role || '').trim()) throw new Error('Participant role is required.');

  return {
    ...participant,
    legalName: String(participant.legalName).trim(),
    role: String(participant.role).trim(),
    royaltyPercentage: normalizePercent(participant.royaltyPercentage, 'Royalty percentage'),
    compositionPercentage: normalizePercent(participant.compositionPercentage, 'Composition percentage'),
    masterPercentage: normalizePercent(participant.masterPercentage, 'Master percentage'),
  };
}

export function assertSplitTotal(participants = [], field, expected = 100) {
  const values = participants
    .map((participant) => normalizePercent(participant?.[field], field))
    .filter((value) => value !== null);

  if (!values.length) return true;
  const total = Math.round(values.reduce((sum, value) => sum + value, 0) * 10000) / 10000;
  if (Math.abs(total - expected) > 0.0001) {
    throw new Error(`${field} values must total ${expected}%. Current total: ${total}%.`);
  }
  return true;
}

export function finalDeliveryGate({ royaltyParticipationRequired = false, royaltyAgreementStatus = 'not_required' } = {}) {
  if (!royaltyParticipationRequired) {
    return { allowed: true, reason: 'No royalty agreement is required for this project.' };
  }

  if (!ROYALTY_AGREEMENT_STATUSES.has(royaltyAgreementStatus)) {
    return { allowed: false, reason: 'Royalty agreement status is invalid.' };
  }

  if (royaltyAgreementStatus !== 'executed') {
    return {
      allowed: false,
      reason: 'Final delivery is locked until the required royalty agreement is fully executed.',
    };
  }

  return { allowed: true, reason: 'Required royalty agreement is fully executed.' };
}

export function canActivateRoyaltyTemplate({ attorneyReviewStatus } = {}) {
  return attorneyReviewStatus === 'approved';
}
