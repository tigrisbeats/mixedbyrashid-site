import Stripe from 'stripe';
import {
  studioDepositCents,
  servicePriceCents,
  MIN_STUDIO_HOURS,
  MAX_AUTO_STUDIO_HOURS,
} from '../lib/portal-rules.mjs';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

function parseBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function sandboxAllowed() {
  const context = process.env.CONTEXT || '';
  return (
    process.env.STRIPE_SANDBOX_ENABLED === 'true' &&
    ['deploy-preview', 'branch-deploy', 'dev'].includes(context)
  );
}

function siteUrl() {
  return (
    process.env.DEPLOY_PRIME_URL ||
    process.env.URL ||
    process.env.SITE_URL ||
    ''
  ).replace(/\/$/, '');
}

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method not allowed.' });
    }
    if (!sandboxAllowed()) {
      return json(503, { error: 'Sandbox checkout is disabled in this context.' });
    }

    const secretKey = process.env.STRIPE_TEST_SECRET_KEY;
    if (!secretKey) {
      return json(503, { error: 'Stripe sandbox secret is not configured.' });
    }

    const stripe = new Stripe(secretKey);
    const body = parseBody(event);
    const service = String(body.service || '').trim();
    const email = String(body.email || '').trim() || undefined;
    const baseUrl = siteUrl();

    if (!baseUrl) {
      return json(503, { error: 'Preview site URL is not configured.' });
    }

    let amountCents;
    let name;
    let successPath;
    let metadata = { service };
    let includedRevisions = 0;

    if (service === 'studio') {
      const hours = Number(body.hours);
      if (!Number.isInteger(hours) || hours < MIN_STUDIO_HOURS || hours > MAX_AUTO_STUDIO_HOURS) {
        return json(400, {
          error: `Studio hours must be a whole number from ${MIN_STUDIO_HOURS} to ${MAX_AUTO_STUDIO_HOURS}.`,
        });
      }

      amountCents = studioDepositCents(hours);
      const sessionTotalCents = hours * 6000;
      name = `MixedByRashid Studio Deposit â ${hours} Hours`;
      metadata = {
        service,
        session_hours: String(hours),
        session_total_cents: String(sessionTotalCents),
        deposit_cents: String(amountCents),
        deposit_policy: 'non_refundable',
      };
      successPath = `/book?checkout=success&hours=${hours}&session_id={CHECKOUT_SESSION_ID}`;
    } else if (service === 'mixing' || service === 'mastering') {
      const quantity = Number(body.quantity || 1);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
        return json(400, { error: 'Quantity must be a whole number from 1 to 50.' });
      }

      amountCents = servicePriceCents(service, quantity);
      includedRevisions = service === 'mixing' ? 2 : 1;
      name = service === 'mixing'
        ? `MixedByRashid Mixing â ${quantity} Song${quantity === 1 ? '' : 's'}`
        : `MixedByRashid Mastering â ${quantity} Song${quantity === 1 ? '' : 's'}`;

      metadata = {
        service,
        quantity: String(quantity),
        included_revisions: String(includedRevisions),
      };
      successPath = `/client?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    } else {
      return json(400, { error: 'Unsupported service.' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name,
            description: service === 'studio'
              ? 'Non-refundable studio booking deposit. Applies toward the selected session total.'
              : 'Paid upfront. Project begins after payment and required files are received.',
          },
        },
      }],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${baseUrl}${successPath}`,
      cancel_url: `${baseUrl}/${service === 'studio' ? 'book' : ''}?checkout=cancelled`,
    });

    return json(200, {
      checkout_url: session.url,
      session_id: session.id,
      amount_cents: amountCents,
      service,
      metadata,
    });
  } catch (error) {
    console.error('create-checkout', error);
    return json(error.statusCode || 500, {
      error: error.statusCode ? error.message : 'Unable to create Stripe checkout.',
    });
  }
}
