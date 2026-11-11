import { paymentRuntimeConfig, storageRuntimeConfig } from './runtime-config.mjs';

export function audioOrdersEnabled(payment) {
  return payment.context === 'deploy-preview' || Netlify.env.get('MIXING_ENABLED') === 'true';
}

export function checkoutReadiness(payment, storage, audioEnabled) {
  const checkout_ready = Boolean(
    ((payment.context === 'production' && payment.mode === 'live') ||
      (payment.context === 'deploy-preview' && payment.mode === 'test')) &&
    payment.checkoutEnabled && payment.checkoutConfigured &&
    payment.webhookEnabled && payment.webhookConfigured
  );
  return {
    checkout_ready,
    audio_orders_ready: Boolean(checkout_ready && audioEnabled && storage.enabled && storage.configured),
  };
}

export function currentCheckoutReadiness() {
  const payment = paymentRuntimeConfig();
  return checkoutReadiness(payment, storageRuntimeConfig(), audioOrdersEnabled(payment));
}
