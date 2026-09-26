create table if not exists portal_clients (
  id uuid primary key default gen_random_uuid(),
  user_id text unique,
  customer_email text not null,
  display_name text,
  storage_provider text not null default 'dropbox' check (storage_provider in ('dropbox')),
  storage_folder_path text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists portal_clients_email_idx
  on portal_clients(lower(customer_email));

create table if not exists portal_project_storage (
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
  cleanup_status text not null default 'active'
    check (cleanup_status in ('active','scheduled','deleted','held','error')),
  deleted_at timestamptz,
  last_cleanup_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_project_storage_client_idx
  on portal_project_storage(client_id);

create index if not exists portal_project_storage_cleanup_idx
  on portal_project_storage(cleanup_status, cleanup_after);

alter table portal_files
  add column if not exists storage_provider text default 'dropbox',
  add column if not exists provider_file_id text,
  add column if not exists provider_path text;

create index if not exists portal_files_provider_path_idx
  on portal_files(provider_path);

alter table portal_orders
  add column if not exists completed_at timestamptz;
