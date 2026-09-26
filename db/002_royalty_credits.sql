alter table portal_orders
  add column if not exists royalty_participation_required boolean not null default false,
  add column if not exists royalty_agreement_status text not null default 'not_required';

alter table portal_orders
  drop constraint if exists portal_orders_royalty_agreement_status_check;

alter table portal_orders
  add constraint portal_orders_royalty_agreement_status_check
  check (royalty_agreement_status in ('not_required','draft','pending_client','pending_admin','executed','void'));

create table if not exists portal_royalty_agreements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references portal_orders(id) on delete cascade,
  agreement_type text not null check (agreement_type in ('mixer_points','producer_points','songwriting_split','soundexchange_lod','custom')),
  status text not null default 'draft' check (status in ('draft','pending_client','pending_admin','executed','void')),
  agreement_version text not null,
  attorney_review_status text not null default 'pending' check (attorney_review_status in ('pending','approved','rejected')),
  royalty_basis text,
  royalty_notes text,
  client_signed_name text,
  client_signed_at timestamptz,
  owner_signed_name text,
  owner_signed_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_royalty_agreements_status_idx on portal_royalty_agreements(status);

create table if not exists portal_royalty_participants (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references portal_royalty_agreements(id) on delete cascade,
  legal_name text not null,
  display_name text,
  email text,
  participant_role text not null,
  royalty_percentage numeric(7,4) check (royalty_percentage is null or (royalty_percentage >= 0 and royalty_percentage <= 100)),
  composition_percentage numeric(7,4) check (composition_percentage is null or (composition_percentage >= 0 and composition_percentage <= 100)),
  master_percentage numeric(7,4) check (master_percentage is null or (master_percentage >= 0 and master_percentage <= 100)),
  pro_name text,
  ipi_cae text,
  soundexchange_payee_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_royalty_participants_agreement_idx on portal_royalty_participants(agreement_id);

create table if not exists portal_project_credits (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references portal_orders(id) on delete cascade,
  credit_role text not null,
  credit_name text not null,
  required boolean not null default true,
  confirmed_by_client_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_project_credits_order_idx on portal_project_credits(order_id);

create table if not exists portal_release_metadata (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references portal_orders(id) on delete cascade,
  artist_name text,
  song_title text,
  isrc text,
  upc text,
  release_date date,
  label_name text,
  distributor text,
  release_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portal_agreement_events (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references portal_royalty_agreements(id) on delete cascade,
  actor_user_id text,
  actor_email text,
  event_type text not null check (event_type in ('created','updated','sent_to_client','client_signed','owner_signed','executed','voided')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists portal_agreement_events_agreement_idx on portal_agreement_events(agreement_id, created_at);
