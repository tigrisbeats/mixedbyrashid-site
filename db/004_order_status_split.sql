alter table portal_orders
  add column if not exists payment_status text not null default 'pending',
  add column if not exists project_status text not null default 'pending',
  add column if not exists paid_at timestamptz;

alter table portal_orders
  drop constraint if exists portal_orders_payment_status_check;

alter table portal_orders
  add constraint portal_orders_payment_status_check
  check (payment_status in ('pending','paid','failed','refunded'));

alter table portal_orders
  drop constraint if exists portal_orders_project_status_check;

alter table portal_orders
  add constraint portal_orders_project_status_check
  check (project_status in ('pending','ready','in_progress','revision','complete','cancelled'));

update portal_orders
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
      when status in ('paid','in_progress','revision','complete')
        then coalesce(paid_at, updated_at, created_at)
      else paid_at
    end,
    completed_at = case
      when status = 'complete' then coalesce(completed_at, updated_at, created_at)
      else completed_at
    end;

create index if not exists portal_orders_payment_status_idx
  on portal_orders(payment_status);

create index if not exists portal_orders_project_status_idx
  on portal_orders(project_status);
