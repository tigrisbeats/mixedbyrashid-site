import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTimestampMs,
  normalizeReviewNote,
  normalizeVersionKey,
  revisionAvailability,
  assertRevisionAvailable,
  canApproveMix,
  rmsMatchGains,
} from '../netlify/lib/review-rules.mjs';

test('timestamp notes accept project positions and reject negative values', () => {
  assert.equal(normalizeTimestampMs(90500), 90500);
  assert.throws(() => normalizeTimestampMs(-1), /Timestamp/);
});

test('review notes are trimmed and bounded', () => {
  assert.equal(normalizeReviewNote('  bring vocal up  '), 'bring vocal up');
  assert.throws(() => normalizeReviewNote(''), /required/);
});

test('version key is required', () => {
  assert.equal(normalizeVersionKey('Mix V2.wav'), 'Mix V2.wav');
  assert.throws(() => normalizeVersionKey(''), /required/);
});

test('revision availability tracks included usage', () => {
  assert.deepEqual(revisionAvailability({ includedRevisions: 2, revisionCount: 1 }), {
    included: 2,
    used: 1,
    remaining: 1,
    extraPaymentRequired: false,
  });
  assert.throws(
    () => assertRevisionAvailable({ includedRevisions: 2, revisionCount: 2 }),
    /Extra revision payment/,
  );
});

test('approval requires paid audio service and a version', () => {
  assert.equal(canApproveMix({ service: 'mixing', paymentStatus: 'paid', versionKey: 'Mix V3.wav' }), true);
  assert.equal(canApproveMix({ service: 'studio', paymentStatus: 'paid', versionKey: 'x' }), false);
  assert.equal(canApproveMix({ service: 'mixing', paymentStatus: 'pending', versionKey: 'x' }), false);
});

test('RMS match only turns louder side down', () => {
  assert.deepEqual(rmsMatchGains(0.1, 0.2), { a: 1, b: 0.5 });
  assert.deepEqual(rmsMatchGains(0.4, 0.2), { a: 0.5, b: 1 });
  assert.deepEqual(rmsMatchGains(0, 0.2), { a: 1, b: 1 });
});
