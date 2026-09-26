import { getDb } from './db.mjs';

export async function markCheckoutPaid(session) {
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
  `;
}

export async function handleStripeCheckoutEvent(stripeEvent) {
  if (
    stripeEvent.type === 'checkout.session.completed' ||
    stripeEvent.type === 'checkout.session.async_payment_succeeded'
  ) {
    await markCheckoutPaid(stripeEvent.data.object);
    return { processed: true, type: stripeEvent.type };
  }

  return { processed: false, type: stripeEvent.type };
}
