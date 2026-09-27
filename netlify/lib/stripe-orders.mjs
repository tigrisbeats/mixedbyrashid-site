import { getDb } from './db.mjs';

async function markCheckoutPaid(session, sql) {
  const email =
    session.customer_details?.email ||
    session.customer_email ||
    session.metadata?.customer_email;

  if (!email) {
    throw new Error('Completed checkout has no customer email.');
  }

  const service = session.metadata?.service;
  if (!['studio', 'mixing', 'mastering'].includes(service)) {
    throw new Error(`Unsupported checkout service: ${service || 'missing'}.`);
  }
  if (!session.id?.startsWith('cs_') || session.mode !== 'payment' || session.currency !== 'usd' ||
      !Number.isSafeInteger(session.amount_total) || session.amount_total <= 0) {
    throw new Error('Checkout receipt has invalid payment fields.');
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

  for (const value of [sessionHours, sessionTotalCents, includedRevisions]) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new Error('Invalid checkout metadata.');
  }

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
      ${typeof session.payment_intent === 'string' ? session.payment_intent : null},
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
    where portal_orders.payment_status = 'pending'
      and portal_orders.service = excluded.service
      and lower(portal_orders.customer_email) = lower(excluded.customer_email)
  `;
}

export async function handleStripeCheckoutEvent(stripeEvent, expectedMode, sql) {
  if (!['live', 'test'].includes(expectedMode) || stripeEvent.livemode !== (expectedMode === 'live')) {
    throw new Error('Unexpected Stripe event mode.');
  }
  if (
    stripeEvent.type === 'checkout.session.completed' ||
    stripeEvent.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = stripeEvent.data?.object;
    if (session?.object !== 'checkout.session' || session.livemode !== stripeEvent.livemode) {
      throw new Error('Unexpected Stripe session mode or object.');
    }
    if (session.payment_status !== 'paid') {
      return { processed: false, type: stripeEvent.type, reason: 'payment_not_paid' };
    }
    await markCheckoutPaid(session, sql || getDb());
    return { processed: true, type: stripeEvent.type };
  }

  return { processed: false, type: stripeEvent.type };
}
