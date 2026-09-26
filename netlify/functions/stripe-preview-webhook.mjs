import Stripe from 'stripe';
import { paymentRuntimeConfig } from '../lib/runtime-config.mjs';
import { handleStripeCheckoutEvent } from '../lib/stripe-orders.mjs';

const json = (status, body) => Response.json(body, { status });

export default async (request) => {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  const runtime = paymentRuntimeConfig();

  if (runtime.context !== 'deploy-preview' || !runtime.webhookEnabled) {
    return json(503, {
      error: 'Stripe preview webhook is disabled in this context.',
    });
  }

  if (!runtime.webhookConfigured) {
    return json(503, {
      error: 'Stripe preview webhook is not fully configured.',
    });
  }

  try {
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return json(400, { error: 'Missing Stripe signature.' });
    }

    const rawBody = await request.text();
    const stripe = new Stripe(runtime.secretKey);
    const stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      runtime.signingSecret
    );

    const result = await handleStripeCheckoutEvent(stripeEvent);
    return json(200, { received: true, ...result });
  } catch (error) {
    console.error('stripe-preview-webhook', error);
    return json(400, {
      error: 'Webhook validation or processing failed.',
    });
  }
};

export const config = {
  path: '/api/stripe-preview',
};
