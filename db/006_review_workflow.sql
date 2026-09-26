alter table portal_orders
  add column if not exists mix_approved_at timestamptz,
  add column if not exists mix_approved_version_key text,
  add column if not exists review_reopened_at timestamptz;

create table if not exists portal_review_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references portal_orders(id) on delete cascade,
  user_id text not null,
  created_by_admin boolean not null default false,
  version_key text not null,
  timestamp_ms integer not null default 0 check (timestamp_ms >= 0),
  note text not null check (char_length(note) between 1 and 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists portal_review_notes_order_id_idx
  on portal_review_notes(order_id, created_at);

create index if not exists portal_review_notes_version_key_idx
  on portal_review_notes(order_id, version_key);
