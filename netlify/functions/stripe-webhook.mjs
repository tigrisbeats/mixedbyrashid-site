import crypto from 'node:crypto';
import { getDb } from '../lib/db.mjs';

const json = (status, body) => Response.json(body, { status });

function liveWebhookAllowed() {
  return Netlify.env.get('CONTEXT') === 'production';
}

function verifyStripeSignature(rawBody, header, secret, toleranceSeconds = 300) {
  if (!header || !secret) return false;

  const pieces = String(header).split(',').map((part) => part.trim());
  const timestampPart = pieces.find((part) => part.startsWith('t='));
  const signatures = pieces
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));

  if (!timestampPart || signatures.length === 0) return false;

  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp)) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > toleranceSeconds) return false;

  const payload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  return signatures.some((signature) => {
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(signature, 'hex');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

function quantityForService(service, session) {
  const explicit = Number(session.metadata?.quantity || 0);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;

  const total = Number(session.amount_total || 0);
  const unit = service === 'mixing' ? 5000 : service === 'mastering' ? 2000 : 0;
  if (!unit || total <= 0 || total % unit !== 0) return 1;

  return Math.max(1, Math.round(total / unit));
}

async function markPaid(session) {
  const email =
    session.customer_details?.email ||
    session.customer_email ||
    session.metadata?.customer_email;

  if (!email) throw new Error('Completed checkout has no customer email.');

  const service = session.metadata?.service;
  if (!['studio', 'mixing', 'mastering'].includes(service)) {
    throw new Error(`Unsupported checkout service: ${service || 'missing'}.`);
  }

  const quantity =
    service === 'mixing' || service === 'mastering'
      ? quantityForService(service, session)
      : null;

  const sessionHours = session.metadata?.session_hours
    ? Number(session.metadata.session_hours)
    : null;

  const sessionTotalCents = session.metadata?.session_total_cents
    ? Number(session.metadata.session_total_cents)
    : null;

  const includedRevisions =
    service === 'mixing' ? 2 : service === 'mastering' ? 1 : 0;

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
      currency,
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
      ${typeof session.payment_intent === 'string' ? session.payment_intent : null},
      ${session.amount_total || 0},
      ${sessionHours},
      ${sessionTotalCents},
      ${includedRevisions},
      ${session.currency || 'usd'},
      now(),
      now()
    )
    on conflict (stripe_checkout_session_id) do update
    set customer_email = excluded.customer_email,
        status = 'paid',
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
        currency = excluded.currency,
        paid_at = coalesce(portal_orders.paid_at, now()),
        updated_at = now()
  `;

  return { service, quantity };
}

export default async (request) => {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  if (!liveWebhookAllowed()) {
    return json(503, { error: 'Live Stripe webhook is production-only.' });
  }

  const signingSecret = Netlify.env.get('STRIPE_LIVE_SIGNING_SECRET');
  if (!signingSecret) {
    return json(503, { error: 'Live Stripe webhook signing secret is not configured.' });
  }

  try {
    const signature = request.headers.get('stripe-signature');
    const rawBody = await request.text();

    if (!verifyStripeSignature(rawBody, signature, signingSecret)) {
      return json(400, { error: 'Invalid Stripe signature.' });
    }

    const event = JSON.parse(rawBody);

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      await markPaid(event.data.object);
    }

    return json(200, { received: true });
  } catch (error) {
    console.error('stripe-webhook', error);
    return json(400, { error: 'Webhook validation or processing failed.' });
  }
};

export const config = {
  path: '/api/stripe-webhook',
};
