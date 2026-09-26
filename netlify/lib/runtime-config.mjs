function bool(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

export function resolvePaymentRuntime(values = {}) {
  const context = String(values.CONTEXT || '').trim();

  if (context === 'deploy-preview') {
    const enabled = bool(values.STRIPE_SANDBOX_ENABLED);
    const secretKey = String(values.STRIPE_TEST_SECRET_KEY || '').trim();
    const signingSecret = String(values.STRIPE_PREVIEW_SIGNING_SECRET || '').trim();

    return {
      context,
      mode: 'test',
      enabled,
      configured: Boolean(secretKey && signingSecret),
      secretKey,
      signingSecret,
    };
  }

  if (context === 'production') {
    const enabled = bool(values.PAYMENTS_ENABLED);
    const secretKey = String(values.STRIPE_LIVE_SECRET_KEY || '').trim();
    const signingSecret = String(values.STRIPE_LIVE_SIGNING_SECRET || '').trim();

    return {
      context,
      mode: 'live',
      enabled,
      configured: Boolean(secretKey && signingSecret),
      secretKey,
      signingSecret,
    };
  }

  return {
    context,
    mode: 'disabled',
    enabled: false,
    configured: false,
    secretKey: '',
    signingSecret: '',
  };
}

export function paymentRuntimeConfig() {
  return resolvePaymentRuntime({
    CONTEXT: Netlify.env.get('CONTEXT'),
    PAYMENTS_ENABLED: Netlify.env.get('PAYMENTS_ENABLED'),
    STRIPE_SANDBOX_ENABLED: Netlify.env.get('STRIPE_SANDBOX_ENABLED'),
    STRIPE_TEST_SECRET_KEY: Netlify.env.get('STRIPE_TEST_SECRET_KEY'),
    STRIPE_PREVIEW_SIGNING_SECRET: Netlify.env.get('STRIPE_PREVIEW_SIGNING_SECRET'),
    STRIPE_LIVE_SECRET_KEY: Netlify.env.get('STRIPE_LIVE_SECRET_KEY'),
    STRIPE_LIVE_SIGNING_SECRET: Netlify.env.get('STRIPE_LIVE_SIGNING_SECRET'),
  });
}

export function resolveStorageRuntime(values = {}) {
  const context = String(values.CONTEXT || '').trim();
  const enabled = context === 'production'
    ? bool(values.PRIVATE_STORAGE_ENABLED)
    : bool(values.PRIVATE_STORAGE_ENABLED) || context === 'deploy-preview';

  const appKey = String(values.DROPBOX_APP_KEY || 'tu7seery1let8fv').trim();
  const appSecret = String(values.DROPBOX_APP_SECRET || '').trim();
  const refreshToken = String(values.DROPBOX_REFRESH_TOKEN || '').trim();

  return {
    context,
    enabled,
    configured: Boolean(appKey && appSecret && refreshToken),
    appKey,
    appSecret,
    refreshToken,
  };
}

export function storageRuntimeConfig() {
  return resolveStorageRuntime({
    CONTEXT: Netlify.env.get('CONTEXT'),
    PRIVATE_STORAGE_ENABLED: Netlify.env.get('PRIVATE_STORAGE_ENABLED'),
    DROPBOX_APP_KEY: Netlify.env.get('DROPBOX_APP_KEY'),
    DROPBOX_APP_SECRET: Netlify.env.get('DROPBOX_APP_SECRET'),
    DROPBOX_REFRESH_TOKEN: Netlify.env.get('DROPBOX_REFRESH_TOKEN'),
  });
}
