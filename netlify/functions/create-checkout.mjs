import Stripe from 'stripe';
import { verifyRequestOrigin } from '@netlify/identity';
import {
  studioDepositCents,
  servicePriceCents,
  MIN_STUDIO_HOURS,
  MAX_AUTO_STUDIO_HOURS,
} from '../lib/portal-rules.mjs';
import { paymentRuntimeConfig } from '../lib/runtime-config.mjs';

const json = (status, body) => Response.json(body, { status });

async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function audioServiceEnabled(runtime, service) {
  if (!['mixing', 'mastering'].includes(service)) return true;
  if (runtime.context !== 'production') return true;
  return Netlify.env.get('MIXING_ENABLED') === 'true';
}

export default async (request) => {
  try {
    if (request.method !== 'POST') {
      return json(405, { error: 'Method not allowed.' });
    }

    verifyRequestOrigin(request);

    const runtime = paymentRuntimeConfig();

    if (!runtime.checkoutEnabled) {
      return json(503, {
        error: runtime.context === 'production'
          ? 'Online payments are not enabled yet.'
          : 'Stripe sandbox checkout is disabled in this context.',
      });
    }

    if (!runtime.checkoutConfigured) {
      return json(503, {
        error: runtime.context === 'production'
          ? 'Production payments are not fully configured.'
          : 'Stripe sandbox is not fully configured.',
      });
    }

    const stripe = new Stripe(runtime.secretKey);
    const body = await parseBody(request);
    const service = String(body.service || '').trim();
    const email = String(body.email || '').trim() || undefined;
    const baseUrl = new URL(request.url).origin;

    if (!audioServiceEnabled(runtime, service)) {
      return json(503, {
        error: 'Online mixing and mastering orders are not enabled yet.',
      });
    }

    let amountCents;
    let name;
    let successPath;
    let metadata = { service, checkout_mode: runtime.mode };

    if (service === 'studio') {
      const hours = Number(body.hours);

      if (
        !Number.isInteger(hours) ||
        hours < MIN_STUDIO_HOURS ||
        hours > MAX_AUTO_STUDIO_HOURS
      ) {
        return json(400, {
          error:
            `Studio hours must be a whole number from ${MIN_STUDIO_HOURS} to ${MAX_AUTO_STUDIO_HOURS}.`,
        });
      }

      amountCents = studioDepositCents(hours);
      const sessionTotalCents = hours * 6000;
      name = `MixedByRashid Studio Deposit - ${hours} Hours`;

      metadata = {
        service,
        checkout_mode: runtime.mode,
        session_hours: String(hours),
        session_total_cents: String(sessionTotalCents),
        deposit_cents: String(amountCents),
        deposit_policy: 'non_refundable',
      };

      successPath =
        `/book?checkout=success&hours=${hours}&session_id={CHECKOUT_SESSION_ID}`;
    } else if (service === 'mixing' || service === 'mastering') {
      const quantity = Number(body.quantity || 1);

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 50
      ) {
        return json(400, {
          error: 'Quantity must be a whole number from 1 to 50.',
        });
      }

      amountCents = servicePriceCents(service, quantity);
      const includedRevisions = service === 'mixing' ? 2 : 1;
      const label = service === 'mixing' ? 'Mixing' : 'Mastering';
      const songWord = quantity === 1 ? 'Song' : 'Songs';

      name = `MixedByRashid ${label} - ${quantity} ${songWord}`;
      metadata = {
        service,
        checkout_mode: runtime.mode,
        quantity: String(quantity),
        included_revisions: String(includedRevisions),
      };

      successPath =
        '/client?checkout=success&session_id={CHECKOUT_SESSION_ID}';
    } else {
      return json(400, { error: 'Unsupported service.' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name,
              description:
                service === 'studio'
                  ? 'Non-refundable studio booking deposit. Applies toward the selected session total.'
                  : 'Paid upfront. Project begins after payment and required files are received.',
            },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${baseUrl}${successPath}`,
      cancel_url:
        service === 'studio'
          ? `${baseUrl}/book?checkout=cancelled`
          : `${baseUrl}/?checkout=cancelled`,
    });

    return json(200, {
      checkout_url: session.url,
      session_id: session.id,
      amount_cents: amountCents,
      service,
      mode: runtime.mode,
      metadata,
    });
  } catch (error) {
    console.error('create-checkout', error);

    return json(error.statusCode || 500, {
      error: error.statusCode
        ? error.message
        : 'Unable to create Stripe checkout.',
    });
  }
};

export const config = {
  path: '/api/create-checkout',
};
