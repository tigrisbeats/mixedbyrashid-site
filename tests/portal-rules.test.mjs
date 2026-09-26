import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FILE_BYTES,
  MAX_ORDER_BYTES,
  MIN_STUDIO_HOURS,
  MAX_AUTO_STUDIO_HOURS,
  studioDepositCents,
  servicePriceCents,
  assertUploadAllowed,
} from '../netlify/lib/portal-rules.mjs';

test('studio booking keeps the approved two-hour minimum', () => {
  assert.equal(MIN_STUDIO_HOURS, 2);
  assert.equal(MAX_AUTO_STUDIO_HOURS, 12);
  assert.equal(studioDepositCents(2), 6000);
});

test('studio booking rejects sessions outside the supported range', () => {
  assert.throws(() => studioDepositCents(1), /integer from 2 to 12/);
  assert.throws(() => studioDepositCents(13), /integer from 2 to 12/);
});

test('mixing and mastering prices match the approved per-song rates', () => {
  assert.equal(servicePriceCents('mixing', 1), 5000);
  assert.equal(servicePriceCents('mixing', 3), 15000);
  assert.equal(servicePriceCents('mastering', 1), 2000);
  assert.equal(servicePriceCents('mastering', 3), 6000);
});

test('unsupported services and invalid quantities are rejected', () => {
  assert.throws(() => servicePriceCents('editing', 1), /Unsupported service/);
  assert.throws(() => servicePriceCents('mixing', 0), /integer from 1 to 50/);
  assert.throws(() => servicePriceCents('mixing', 51), /integer from 1 to 50/);
});

test('portal upload limits enforce per-file and per-order ceilings', () => {
  assert.equal(MAX_FILE_BYTES, 5 * 1024 ** 3);
  assert.equal(MAX_ORDER_BYTES, 25 * 1024 ** 3);
  assert.equal(assertUploadAllowed({ fileSize: 1024, currentProjectBytes: 0 }), true);
  assert.throws(
    () => assertUploadAllowed({ fileSize: MAX_FILE_BYTES + 1, currentProjectBytes: 0 }),
    /5 GB/
  );
  assert.throws(
    () => assertUploadAllowed({ fileSize: 1024, currentProjectBytes: MAX_ORDER_BYTES }),
    /25 GB/
  );
});
