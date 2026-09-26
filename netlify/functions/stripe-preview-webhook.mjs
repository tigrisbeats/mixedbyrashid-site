import Stripe from 'stripe';
import { getDb } from '../lib/db.mjs';

const json = (status, body) => Response.json(body, { status });

function sandboxAllowed() {
  return (
    Netlify.env.get('STRIPE_SANDBOX_ENABLED') === 'true' &&
    Netlify.env.get('CONTEXT') === 'deploy-preview'
  );
}

async function markPaid(session) {
  const email =
    session.customer_details?.email ||
    session.customer_email ||
    session.metadata?.customer_email;

  if (!email) {
    throw new Error('Completed checkout has no customer email.');
  }

  const service = session.metadata?.service;
  if (!['studio', 'mixing', 'mastering'].includes(service)) {
    throw new Error(
      `Unsupported checkout service: ${service || 'missing'}.`
    );
  }

  const sessionHours = session.metadata?.session_hours
    ? Number(session.metadata.session_hours)
    : null;

  const sessionTotalCents = session.metadata?.session_total_cents
    ? Number(session.metadata.session_total_cents)
    : null;

  const includedRevisions = session.metadata?.included_revisions
    ? Number(session.metadata.included_revisions)
    : service === 'mixing'
      ? 2
      : service === 'mastering'
        ? 1
        : 0;

  const sql = getDb();

  await sql`
    insert into portal_orders (
      customer_email,
      service,
      status,
      payment_status,
      project_status,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      amount_total_cents,
      session_hours,
      session_total_cents,
      included_revisions,
      paid_at,
      updated_at
    )
    values (
      ${email},
      ${service},
      'paid',
      'paid',
      'ready',
      ${session.id},
      ${typeof session.payment_intent === 'string'
        ? session.payment_intent
        : null},
      ${session.amount_total || 0},
      ${sessionHours},
      ${sessionTotalCents},
      ${includedRevisions},
      now(),
      now()
    )
    on conflict (stripe_checkout_session_id) do update
    set customer_email = excluded.customer_email,
        payment_status = 'paid',
        project_status = case
          when portal_orders.project_status = 'pending' then 'ready'
          else portal_orders.project_status
        end,
        stripe_payment_intent_id = excluded.stripe_payment_intent_id,
        amount_total_cents = excluded.amount_total_cents,
        session_hours = excluded.session_hours,
        session_total_cents = excluded.session_total_cents,
        included_revisions = excluded.included_revisions,
        paid_at = coalesce(portal_orders.paid_at, now()),
        updated_at = now()
  `;
}

export default async (request) => {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  if (!sandboxAllowed()) {
    return json(503, {
      error: 'Stripe preview webhook is disabled in this context.',
    });
  }

  const secretKey = Netlify.env.get('STRIPE_TEST_SECRET_KEY');
  const signingSecret = Netlify.env.get('STRIPE_PREVIEW_SIGNING_SECRET');

  if (!secretKey || !signingSecret) {
    return json(503, {
      error: 'Stripe preview webhook is not configured.',
    });
  }

  try {
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return json(400, {
        error: 'Missing Stripe signature.',
      });
    }

    const rawBody = await request.text();
    const stripe = new Stripe(secretKey);

    const stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      signingSecret
    );

    if (
      stripeEvent.type === 'checkout.session.completed' ||
      stripeEvent.type === 'checkout.session.async_payment_succeeded'
    ) {
      await markPaid(stripeEvent.data.object);
    }

    return json(200, { received: true });
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
