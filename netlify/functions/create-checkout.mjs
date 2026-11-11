import Stripe from 'stripe';
import { randomInt } from 'node:crypto';
import { verifyPortalMutation } from '../lib/auth.mjs';
import {
  studioDepositCents,
  servicePriceCents,
  MIN_STUDIO_HOURS,
  MAX_AUTO_STUDIO_HOURS,
  STUDIO_RATE_CENTS,
} from '../lib/portal-rules.mjs';
import { paymentRuntimeConfig, storageRuntimeConfig } from '../lib/runtime-config.mjs';
import { audioOrdersEnabled, checkoutReadiness } from '../lib/checkout-readiness.mjs';
import { livePaymentLink } from '../lib/live-payment-links.mjs';

const json = (status, body) => Response.json(body, { status });
const unavailable = 'Online checkout is temporarily unavailable. Please try again shortly.';

export function createCheckoutHandler({
  runtimeConfig = paymentRuntimeConfig,
  storageConfig = storageRuntimeConfig,
  audioEnabled = audioOrdersEnabled,
  createSession = (key, params) => new Stripe(key).checkout.sessions.create(params),
} = {}) {
  return async (request) => {
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
    try { verifyPortalMutation(request); }
    catch { return json(403, { error: 'Request origin is not allowed.' }); }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json(400, { error: 'Request body must be a JSON object.' });
    }
    const service = body.service;
    if (!['studio', 'mixing', 'mastering'].includes(service)) {
      return json(400, { error: 'Unsupported service.' });
    }
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if ((service !== 'studio' && !email) ||
        (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) {
      return json(400, { error: 'Enter a valid email address for your receipt and client portal.' });
    }

    try {
      const runtime = runtimeConfig();
      const readiness = checkoutReadiness(runtime, storageConfig(), audioEnabled(runtime));
      if (!readiness.checkout_ready || (service !== 'studio' && !readiness.audio_orders_ready)) {
        return json(503, { error: unavailable });
      }
      const baseUrl = new URL(request.url).origin;
      const metadata = { service, checkout_mode: runtime.mode };
      let amountCents, name, successPath, cancelPath, description;

      if (service === 'studio') {
        const hours = Number(body.hours);
        if (!Number.isInteger(hours) || hours < MIN_STUDIO_HOURS || hours > MAX_AUTO_STUDIO_HOURS) {
          return json(400, { error: `Studio hours must be a whole number from ${MIN_STUDIO_HOURS} to ${MAX_AUTO_STUDIO_HOURS}.` });
        }
        amountCents = studioDepositCents(hours);
        name = `MixedByRashid Studio Deposit - ${hours} Hours`;
        Object.assign(metadata, {
          session_hours: String(hours),
          session_total_cents: String(hours * STUDIO_RATE_CENTS),
          deposit_cents: String(amountCents),
          deposit_policy: 'non_refundable',
        });
        description = 'Non-refundable studio booking deposit. Applies toward the selected session total.';
        successPath = '/book?checkout=success&session_id={CHECKOUT_SESSION_ID}';
        cancelPath = '/book?checkout=cancelled';
      } else {
        const quantity = Number(body.quantity ?? 1);
        if (typeof body.quantity === 'boolean' || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
          return json(400, { error: 'Quantity must be a whole number from 1 to 50.' });
        }
        if (readiness.hosted_checkout && quantity !== 1) {
          return json(400, { error: 'Choose your number of songs on the Stripe checkout page.' });
        }
        amountCents = servicePriceCents(service, quantity);
        const label = service === 'mixing' ? 'Mixing' : 'Mastering';
        name = `MixedByRashid ${label} - ${quantity} ${quantity === 1 ? 'Song' : 'Songs'}`;
        Object.assign(metadata, { quantity: String(quantity), included_revisions: service === 'mixing' ? '2' : '1' });
        description = 'Paid upfront. Project begins after payment and required files are received.';
        successPath = '/client?checkout=success&session_id={CHECKOUT_SESSION_ID}';
        cancelPath = `/order?service=${service}&quantity=${quantity}&checkout=cancelled`;
      }

      if (readiness.hosted_checkout) {
        const checkout_url = livePaymentLink(service, metadata.session_hours, email);
        if (!checkout_url) return json(503, { error: unavailable });
        return json(200, { checkout_url, amount_cents: amountCents, service, mode: 'live', provider: 'payment_link' });
      }

      const session = await createSession(runtime.secretKey, {
        mode: 'payment',
        integration_identifier: `mixedbyrashid_${Array.from({ length: 8 }, () => String.fromCharCode(97 + randomInt(26))).join('')}`,
        customer_email: email || undefined,
        line_items: [{
          quantity: 1,
          price_data: { currency: 'usd', unit_amount: amountCents, product_data: { name, description } },
        }],
        metadata,
        payment_intent_data: { metadata },
        success_url: `${baseUrl}${successPath}`,
        cancel_url: `${baseUrl}${cancelPath}`,
      });

      if (session.livemode !== (runtime.mode === 'live') || !session.url) {
        throw new Error('Stripe returned an unusable session.');
      }
      return json(200, {
        checkout_url: session.url,
        session_id: session.id,
        amount_cents: amountCents,
        service,
        mode: runtime.mode,
      });
    } catch (error) {
      console.error('create-checkout-failed', { type: error.type || 'CheckoutError', code: error.code || 'unknown' });
      return json(503, { error: 'Unable to open secure checkout. Please try again shortly.' });
    }
  };
}

export default createCheckoutHandler();

export const config = { path: '/api/create-checkout' };
