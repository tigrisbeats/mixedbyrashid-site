create table if not exists portal_orders (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  customer_email text not null,
  service text not null check (service in ('mixing','mastering','studio')),
  status text not null default 'pending' check (status in ('pending','paid','in_progress','revision','complete','cancelled')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  amount_total_cents integer not null default 0,
  session_hours integer,
  included_revisions integer not null default 0,
  revision_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_orders_user_id_idx on portal_orders(user_id);
create index if not exists portal_orders_customer_email_idx on portal_orders(lower(customer_email));
create index if not exists portal_orders_status_idx on portal_orders(status);

create table if not exists portal_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references portal_orders(id) on delete cascade,
  uploader_user_id text,
  object_key text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint not null check (size_bytes >= 0),
  file_role text not null check (file_role in ('stem','rough_mix','reference','alternate','revision','final_mix','final_master')),
  version_label text,
  created_at timestamptz not null default now()
);

create index if not exists portal_files_order_id_idx on portal_files(order_id);

create table if not exists portal_revision_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references portal_orders(id) on delete cascade,
  user_id text not null,
  notes text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists portal_revision_order_id_idx on portal_revision_requests(order_id);
