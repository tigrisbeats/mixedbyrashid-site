import { getDb } from '../lib/db.mjs';

const json = (status, body) => Response.json(body, {
  status,
  headers: { 'cache-control': 'no-store' },
});

const VERSION = '20260926_portal_v1';

const statements = [
  `create extension if not exists pgcrypto`,
  `create table if not exists portal_schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )`,
  `create table if not exists portal_orders (
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
  )`,
  `create index if not exists portal_orders_user_id_idx on portal_orders(user_id)`,
  `create index if not exists portal_orders_customer_email_idx on portal_orders(lower(customer_email))`,
  `create index if not exists portal_orders_status_idx on portal_orders(status)`,
  `create table if not exists portal_files (
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
  )`,
  `create index if not exists portal_files_order_id_idx on portal_files(order_id)`,
  `create table if not exists portal_revision_requests (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references portal_orders(id) on delete cascade,
    user_id text not null,
    notes text not null,
    created_at timestamptz not null default now(),
    resolved_at timestamptz
  )`,
  `create index if not exists portal_revision_order_id_idx on portal_revision_requests(order_id)`,
  `alter table portal_orders add column if not exists royalty_participation_required boolean not null default false`,
  `alter table portal_orders add column if not exists royalty_agreement_status text not null default 'not_required'`,
  `alter table portal_orders drop constraint if exists portal_orders_royalty_agreement_status_check`,
  `alter table portal_orders add constraint portal_orders_royalty_agreement_status_check check (royalty_agreement_status in ('not_required','draft','pending_client','pending_admin','executed','void'))`,
  `create table if not exists portal_royalty_agreements (
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
  )`,
  `create index if not exists portal_royalty_agreements_status_idx on portal_royalty_agreements(status)`,
  `create table if not exists portal_royalty_participants (
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
  )`,
  `create index if not exists portal_royalty_participants_agreement_idx on portal_royalty_participants(agreement_id)`,
  `create table if not exists portal_project_credits (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references portal_orders(id) on delete cascade,
    credit_role text not null,
    credit_name text not null,
    required boolean not null default true,
    confirmed_by_client_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create index if not exists portal_project_credits_order_idx on portal_project_credits(order_id)`,
  `create table if not exists portal_release_metadata (
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
  )`,
  `create table if not exists portal_agreement_events (
    id uuid primary key default gen_random_uuid(),
    agreement_id uuid not null references portal_royalty_agreements(id) on delete cascade,
    actor_user_id text,
    actor_email text,
    event_type text not null check (event_type in ('created','updated','sent_to_client','client_signed','owner_signed','executed','voided')),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists portal_agreement_events_agreement_idx on portal_agreement_events(agreement_id, created_at)`,
  `create table if not exists portal_clients (
    id uuid primary key default gen_random_uuid(),
    user_id text unique,
    customer_email text not null,
    display_name text,
    storage_provider text not null default 'dropbox' check (storage_provider in ('dropbox')),
    storage_folder_path text unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create unique index if not exists portal_clients_email_idx on portal_clients(lower(customer_email))`,
  `create table if not exists portal_project_storage (
    order_id uuid primary key references portal_orders(id) on delete cascade,
    client_id uuid not null references portal_clients(id) on delete cascade,
    provider text not null default 'dropbox' check (provider in ('dropbox')),
    project_folder_path text not null unique,
    source_request_id text,
    source_request_url text,
    reference_request_id text,
    reference_request_url text,
    file_request_open boolean not null default true,
    retention_days integer not null default 30 check (retention_days between 1 and 365),
    cleanup_after timestamptz,
    cleanup_status text not null default 'active' check (cleanup_status in ('active','scheduled','deleted','held','error')),
    deleted_at timestamptz,
    last_cleanup_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create index if not exists portal_project_storage_client_idx on portal_project_storage(client_id)`,
  `create index if not exists portal_project_storage_cleanup_idx on portal_project_storage(cleanup_status, cleanup_after)`,
  `alter table portal_files add column if not exists storage_provider text default 'dropbox'`,
  `alter table portal_files add column if not exists provider_file_id text`,
  `alter table portal_files add column if not exists provider_path text`,
  `create index if not exists portal_files_provider_path_idx on portal_files(provider_path)`,
  `alter table portal_orders add column if not exists completed_at timestamptz`,
  `alter table portal_orders add column if not exists payment_status text not null default 'pending'`,
  `alter table portal_orders add column if not exists project_status text not null default 'pending'`,
  `alter table portal_orders add column if not exists paid_at timestamptz`,
  `alter table portal_orders drop constraint if exists portal_orders_payment_status_check`,
  `alter table portal_orders add constraint portal_orders_payment_status_check check (payment_status in ('pending','paid','failed','refunded'))`,
  `alter table portal_orders drop constraint if exists portal_orders_project_status_check`,
  `alter table portal_orders add constraint portal_orders_project_status_check check (project_status in ('pending','ready','in_progress','revision','complete','cancelled'))`,
  `update portal_orders
    set payment_status = case
      when status in ('paid','in_progress','revision','complete') then 'paid'
      when status = 'cancelled' then 'failed'
      else payment_status
    end,
    project_status = case
      when status = 'paid' then 'ready'
      when status = 'in_progress' then 'in_progress'
      when status = 'revision' then 'revision'
      when status = 'complete' then 'complete'
      when status = 'cancelled' then 'cancelled'
      else project_status
    end,
    paid_at = case
      when status in ('paid','in_progress','revision','complete') then coalesce(paid_at, updated_at, created_at)
      else paid_at
    end,
    completed_at = case
      when status = 'complete' then coalesce(completed_at, updated_at, created_at)
      else completed_at
    end`,
  `create index if not exists portal_orders_payment_status_idx on portal_orders(payment_status)`,
  `create index if not exists portal_orders_project_status_idx on portal_orders(project_status)`,
  `alter table portal_orders add column if not exists session_total_cents integer`,
  `alter table portal_orders add column if not exists currency text not null default 'usd'`,
  `create index if not exists portal_orders_stripe_checkout_idx on portal_orders(stripe_checkout_session_id)`,
  `alter table portal_orders add column if not exists mix_approved_at timestamptz`,
  `alter table portal_orders add column if not exists mix_approved_version_key text`,
  `alter table portal_orders add column if not exists review_reopened_at timestamptz`,
  `create table if not exists portal_review_notes (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references portal_orders(id) on delete cascade,
    user_id text not null,
    created_by_admin boolean not null default false,
    version_key text not null,
    timestamp_ms integer not null default 0 check (timestamp_ms >= 0),
    note text not null check (char_length(note) between 1 and 2000),
    created_at timestamptz not null default now(),
    resolved_at timestamptz
  )`,
  `create index if not exists portal_review_notes_order_id_idx on portal_review_notes(order_id, created_at)`,
  `create index if not exists portal_review_notes_version_key_idx on portal_review_notes(order_id, version_key)`,
  `alter table portal_project_storage add column if not exists revision_request_id text`,
  `alter table portal_project_storage add column if not exists revision_request_url text`,
  `alter table portal_project_storage add column if not exists final_request_id text`,
  `alter table portal_project_storage add column if not exists final_request_url text`
];

export default async (request) => {
  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed.' });
  }

  if (Netlify.env.get('CONTEXT') !== 'production') {
    return json(503, { ok: false, error: 'Production-only migration.' });
  }

  if (Netlify.env.get('PORTAL_SCHEMA_APPLY_ENABLED') !== 'true') {
    return json(403, { ok: false, error: 'Schema apply is disabled.' });
  }

  try {
    const sql = getDb();

    await sql.unsafe(statements[0]);
    await sql.unsafe(statements[1]);

    const existing = await sql`
      select version
      from portal_schema_migrations
      where version = ${VERSION}
      limit 1
    `;

    if (existing[0]) {
      return json(200, { ok: true, version: VERSION, already_applied: true });
    }

    for (const statement of statements.slice(2)) {
      await sql.unsafe(statement);
    }

    await sql`
      insert into portal_schema_migrations (version)
      values (${VERSION})
      on conflict (version) do nothing
    `;

    return json(200, {
      ok: true,
      version: VERSION,
      statements_applied: statements.length,
    });
  } catch (error) {
    console.error('portal-schema-apply', error);
    return json(500, {
      ok: false,
      error: 'Portal schema migration failed.',
      detail: String(error?.message || 'Unknown database error').slice(0, 500),
    });
  }
};

export const config = {
  path: '/api/portal-schema-apply',
};
