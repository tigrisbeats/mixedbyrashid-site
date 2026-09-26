import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSplitTotal,
  canActivateRoyaltyTemplate,
  finalDeliveryGate,
  normalizePercent,
  validateParticipant,
} from '../netlify/lib/royalty-rules.mjs';

test('flat-fee projects without royalty participation can deliver', () => {
  const result = finalDeliveryGate({ royaltyParticipationRequired: false });
  assert.equal(result.allowed, true);
});

test('royalty projects stay locked before execution', () => {
  for (const status of ['draft', 'pending_client', 'pending_admin', 'void']) {
    const result = finalDeliveryGate({
      royaltyParticipationRequired: true,
      royaltyAgreementStatus: status,
    });
    assert.equal(result.allowed, false);
  }
});

test('royalty projects unlock after execution', () => {
  const result = finalDeliveryGate({
    royaltyParticipationRequired: true,
    royaltyAgreementStatus: 'executed',
  });
  assert.equal(result.allowed, true);
});

test('percentages must stay between zero and one hundred', () => {
  assert.equal(normalizePercent(12.5), 12.5);
  assert.throws(() => normalizePercent(-1), /between 0 and 100/);
  assert.throws(() => normalizePercent(101), /between 0 and 100/);
});

test('participant validation requires legal name and role', () => {
  const participant = validateParticipant({
    legalName: 'Rashid Engineer',
    role: 'Mixing Engineer',
    royaltyPercentage: 2,
  });
  assert.equal(participant.royaltyPercentage, 2);
  assert.throws(() => validateParticipant({ role: 'Producer' }), /legal name/);
});

test('declared composition splits must total one hundred percent', () => {
  assert.equal(
    assertSplitTotal([
      { compositionPercentage: 50 },
      { compositionPercentage: 50 },
    ], 'compositionPercentage'),
    true,
  );
  assert.throws(
    () => assertSplitTotal([
      { compositionPercentage: 60 },
      { compositionPercentage: 30 },
    ], 'compositionPercentage'),
    /must total 100%/,
  );
});

test('royalty templates cannot activate before attorney approval', () => {
  assert.equal(canActivateRoyaltyTemplate({ attorneyReviewStatus: 'pending' }), false);
  assert.equal(canActivateRoyaltyTemplate({ attorneyReviewStatus: 'approved' }), true);
});
