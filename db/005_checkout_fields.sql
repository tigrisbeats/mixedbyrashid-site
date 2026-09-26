alter table portal_orders
  add column if not exists session_total_cents integer,
  add column if not exists currency text not null default 'usd';

create index if not exists portal_orders_stripe_checkout_idx
  on portal_orders(stripe_checkout_session_id);
