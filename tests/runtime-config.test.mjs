import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePaymentRuntime,
  resolveStorageRuntime,
} from '../netlify/lib/runtime-config.mjs';

test('production payments require explicit enable flag and both live Stripe secrets', () => {
  const disabled = resolvePaymentRuntime({
    CONTEXT: 'production',
    PAYMENTS_ENABLED: 'false',
    STRIPE_LIVE_SECRET_KEY: 'sk_live_example',
    STRIPE_LIVE_SIGNING_SECRET: 'whsec_example',
  });
  assert.equal(disabled.mode, 'live');
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.configured, true);

  const missingSecret = resolvePaymentRuntime({
    CONTEXT: 'production',
    PAYMENTS_ENABLED: 'true',
    STRIPE_LIVE_SECRET_KEY: 'sk_live_example',
  });
  assert.equal(missingSecret.enabled, true);
  assert.equal(missingSecret.configured, false);

  const ready = resolvePaymentRuntime({
    CONTEXT: 'production',
    PAYMENTS_ENABLED: 'true',
    STRIPE_LIVE_SECRET_KEY: 'sk_live_example',
    STRIPE_LIVE_SIGNING_SECRET: 'whsec_example',
  });
  assert.equal(ready.enabled, true);
  assert.equal(ready.configured, true);
});

test('deploy preview Stripe remains isolated behind sandbox flag', () => {
  const preview = resolvePaymentRuntime({
    CONTEXT: 'deploy-preview',
    STRIPE_SANDBOX_ENABLED: 'true',
    STRIPE_TEST_SECRET_KEY: 'sk_test_example',
    STRIPE_PREVIEW_SIGNING_SECRET: 'whsec_preview',
  });
  assert.equal(preview.mode, 'test');
  assert.equal(preview.enabled, true);
  assert.equal(preview.configured, true);
});

test('non-payment contexts stay disabled even when keys are present', () => {
  const runtime = resolvePaymentRuntime({
    CONTEXT: 'branch-deploy',
    PAYMENTS_ENABLED: 'true',
    STRIPE_LIVE_SECRET_KEY: 'sk_live_example',
    STRIPE_LIVE_SIGNING_SECRET: 'whsec_example',
  });
  assert.equal(runtime.enabled, false);
  assert.equal(runtime.configured, false);
  assert.equal(runtime.mode, 'disabled');
});

test('production Dropbox storage requires explicit enable flag and all credentials', () => {
  const disabled = resolveStorageRuntime({
    CONTEXT: 'production',
    PRIVATE_STORAGE_ENABLED: 'false',
    DROPBOX_APP_KEY: 'key',
    DROPBOX_APP_SECRET: 'secret',
    DROPBOX_REFRESH_TOKEN: 'refresh',
  });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.configured, true);

  const missingRefresh = resolveStorageRuntime({
    CONTEXT: 'production',
    PRIVATE_STORAGE_ENABLED: 'true',
    DROPBOX_APP_KEY: 'key',
    DROPBOX_APP_SECRET: 'secret',
  });
  assert.equal(missingRefresh.enabled, true);
  assert.equal(missingRefresh.configured, false);

  const ready = resolveStorageRuntime({
    CONTEXT: 'production',
    PRIVATE_STORAGE_ENABLED: 'true',
    DROPBOX_APP_KEY: 'key',
    DROPBOX_APP_SECRET: 'secret',
    DROPBOX_REFRESH_TOKEN: 'refresh',
  });
  assert.equal(ready.enabled, true);
  assert.equal(ready.configured, true);
});
