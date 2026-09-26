import crypto from 'node:crypto';
import { handleStripeCheckoutEvent } from '../lib/stripe-orders.mjs';

const json = (status, body) => Response.json(body, { status });

function verifyStripeSignature(rawBody, header, secret, toleranceSeconds = 300) {
  if (!header || !secret) return false;

  const parts = String(header).split(',').map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith('t='));
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));

  if (!timestampPart || signatures.length === 0) return false;

  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp)) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > toleranceSeconds) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  return signatures.some((signature) => {
    try {
      const expectedBuffer = Buffer.from(expected, 'hex');
      const signatureBuffer = Buffer.from(signature, 'hex');
      return (
        expectedBuffer.length === signatureBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
      );
    } catch {
      return false;
    }
  });
}

export default async (request) => {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  if (Netlify.env.get('CONTEXT') !== 'production') {
    return json(503, { error: 'Production Stripe webhook is disabled in this context.' });
  }

  const signingSecret = Netlify.env.get('STRIPE_LIVE_SIGNING_SECRET');
  if (!signingSecret) {
    return json(503, { error: 'Production Stripe webhook is not configured.' });
  }

  try {
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!verifyStripeSignature(rawBody, signature, signingSecret)) {
      return json(400, { error: 'Invalid Stripe signature.' });
    }

    const stripeEvent = JSON.parse(rawBody);
    const result = await handleStripeCheckoutEvent(stripeEvent);

    return json(200, { received: true, ...result });
  } catch (error) {
    console.error('stripe-webhook', error);
    return json(400, { error: 'Webhook validation or processing failed.' });
  }
};

export const config = {
  path: '/api/stripe-webhook',
};
