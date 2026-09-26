import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePaymentRuntime,
  resolveStorageRuntime,
} from '../netlify/lib/runtime-config.mjs';

test('production checkout and webhook have independent safety switches', () => {
  const runtime = resolvePaymentRuntime({
    CONTEXT: 'production',
    PAYMENTS_ENABLED: 'false',
    STRIPE_LIVE_WEBHOOK_ENABLED: 'true',
    STRIPE_LIVE_SIGNING_SECRET: 'whsec_example',
  });

  assert.equal(runtime.mode, 'live');
  assert.equal(runtime.checkoutEnabled, false);
  assert.equal(runtime.checkoutConfigured, false);
  assert.equal(runtime.webhookEnabled, true);
  assert.equal(runtime.webhookConfigured, true);
  assert.equal(runtime.enabled, false);
  assert.equal(runtime.configured, false);
});

test('production custom checkout only requires its live API key', () => {
  const runtime = resolvePaymentRuntime({
    CONTEXT: 'production',
    PAYMENTS_ENABLED: 'true',
    STRIPE_LIVE_SECRET_KEY: 'sk_live_example',
    STRIPE_LIVE_WEBHOOK_ENABLED: 'false',
  });

  assert.equal(runtime.checkoutEnabled, true);
  assert.equal(runtime.checkoutConfigured, true);
  assert.equal(runtime.webhookEnabled, false);
  assert.equal(runtime.webhookConfigured, false);
});

test('deploy preview Stripe remains isolated behind sandbox flag', () => {
  const preview = resolvePaymentRuntime({
    CONTEXT: 'deploy-preview',
    STRIPE_SANDBOX_ENABLED: 'true',
    STRIPE_TEST_SECRET_KEY: 'sk_test_example',
    STRIPE_PREVIEW_SIGNING_SECRET: 'whsec_preview',
  });
  assert.equal(preview.mode, 'test');
  assert.equal(preview.checkoutEnabled, true);
  assert.equal(preview.checkoutConfigured, true);
  assert.equal(preview.webhookEnabled, true);
  assert.equal(preview.webhookConfigured, true);
});

test('non-payment contexts stay disabled even when keys are present', () => {
  const runtime = resolvePaymentRuntime({
    CONTEXT: 'branch-deploy',
    PAYMENTS_ENABLED: 'true',
    STRIPE_LIVE_SECRET_KEY: 'sk_live_example',
    STRIPE_LIVE_SIGNING_SECRET: 'whsec_example',
  });
  assert.equal(runtime.checkoutEnabled, false);
  assert.equal(runtime.checkoutConfigured, false);
  assert.equal(runtime.webhookEnabled, false);
  assert.equal(runtime.webhookConfigured, false);
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


test('Dropbox storage can use the public app key fallback', () => {
  const ready = resolveStorageRuntime({
    CONTEXT: 'production',
    PRIVATE_STORAGE_ENABLED: 'true',
    DROPBOX_APP_SECRET: 'secret',
    DROPBOX_REFRESH_TOKEN: 'refresh',
  });
  assert.equal(ready.appKey, 'tu7seery1let8fv');
  assert.equal(ready.configured, true);
});
