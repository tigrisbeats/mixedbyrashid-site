import Stripe from 'stripe';
import { paymentRuntimeConfig } from './runtime-config.mjs';
import { handleStripeCheckoutEvent } from './stripe-orders.mjs';

export function createStripeWebhookHandler(expectedMode, {
  runtimeConfig = paymentRuntimeConfig,
  processEvent = handleStripeCheckoutEvent,
} = {}) {
  return async (request) => {
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
    const runtime = runtimeConfig();
    const expectedContext = expectedMode === 'live' ? 'production' : 'deploy-preview';
    if (runtime.context !== expectedContext || runtime.mode !== expectedMode || !runtime.webhookEnabled) {
      return Response.json({ error: 'Stripe webhook is disabled in this context.' }, { status: 503 });
    }
    if (!runtime.webhookConfigured) return Response.json({ error: 'Stripe webhook is not fully configured.' }, { status: 503 });

    let event;
    try {
      const body = await request.text();
      if (Buffer.byteLength(body) > 1_000_000) return Response.json({ error: 'Webhook payload is too large.' }, { status: 413 });
      event = Stripe.webhooks.constructEvent(body, request.headers.get('stripe-signature'), runtime.signingSecret);
    } catch {
      return Response.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
    }
    if (event.livemode !== (expectedMode === 'live')) {
      return Response.json({ error: 'Stripe event mode does not match this endpoint.' }, { status: 400 });
    }
    try {
      const result = await processEvent(event, expectedMode);
      return Response.json({ received: true, ...result });
    } catch {
      console.error('stripe-webhook-processing-failed', { eventId: event.id, type: event.type });
      return Response.json({ error: 'Webhook processing failed. Retry delivery.' }, { status: 500 });
    }
  };
}
