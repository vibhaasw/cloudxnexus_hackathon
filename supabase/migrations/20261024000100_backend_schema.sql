-- Smart Warehouse IoT backend schema. All product weights and expiry values
-- in this demo are simulated; do not interpret expiry as food-safety advice.

create extension if not exists pgcrypto with schema extensions;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 80),
  category text not null check (char_length(category) between 1 and 64),
  weight_kg numeric(7, 3) not null unique check (weight_kg > 0),
  shelf_life_days integer not null check (shelf_life_days between 1 and 3650),
  created_at timestamptz not null default now()
);

create table public.pending_parcels (
  id uuid primary key default gen_random_uuid(),
  tag_uid text not null check (char_length(tag_uid) between 1 and 128),
  product_id uuid not null references public.products(id) on delete restrict,
  weight_kg numeric(7, 3) not null check (weight_kg > 0),
  registered_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'received')),
  received_at timestamptz,
  constraint pending_parcels_received_state_check
    check ((status = 'pending' and received_at is null) or
           (status = 'received' and received_at is not null))
);

-- A UID may be registered again after its prior parcel is received, but never
-- more than once while pending.
create unique index pending_parcels_one_pending_per_tag
  on public.pending_parcels (tag_uid)
  where status = 'pending';
create index pending_parcels_tag_status_idx
  on public.pending_parcels (tag_uid, status);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  tag_uid text not null check (char_length(tag_uid) between 1 and 128),
  quantity integer not null check (quantity > 0),
  simulated_mfg_date date not null,
  simulated_expiry_date date not null,
  arrived_at timestamptz not null default now(),
  constraint batches_simulated_expiry_after_mfg_check
    check (simulated_expiry_date >= simulated_mfg_date)
);
create index batches_product_arrived_idx on public.batches (product_id, arrived_at);
create index batches_tag_uid_idx on public.batches (tag_uid);

create table public.arrival_events (
  id uuid primary key default gen_random_uuid(),
  device_id text not null check (char_length(device_id) between 1 and 128),
  tag_uid text not null check (char_length(tag_uid) between 1 and 128),
  batch_id uuid references public.batches(id) on delete set null,
  result text not null check (result in ('ok', 'unknown_tag', 'duplicate')),
  created_at timestamptz not null default now()
);
create index arrival_events_tag_created_idx
  on public.arrival_events (tag_uid, created_at desc);

create table public.forecasts (
  forecast_date date not null,
  product_id uuid not null references public.products(id) on delete cascade,
  p10 numeric(12, 3) not null check (p10 >= 0),
  p50 numeric(12, 3) not null check (p50 >= 0),
  p90 numeric(12, 3) not null check (p90 >= 0),
  generated_at timestamptz not null default now(),
  constraint forecasts_quantile_order_check check (p10 <= p50 and p50 <= p90),
  constraint forecasts_date_product_unique unique (forecast_date, product_id)
);

-- Sell-date calculation is intentionally deferred to the later workstream.
-- NULL means "not calculated yet", not "no expiry risk".
create table public.sell_estimates (
  batch_id uuid primary key references public.batches(id) on delete cascade,
  estimated_sell_date date,
  expiry_risk boolean,
  computed_at timestamptz
);

-- RLS is enabled everywhere. The anon/public key can SELECT only the five
-- dashboard tables below. No public or authenticated role can write any table.
alter table public.products enable row level security;
alter table public.pending_parcels enable row level security;
alter table public.batches enable row level security;
alter table public.arrival_events enable row level security;
alter table public.forecasts enable row level security;
alter table public.sell_estimates enable row level security;

grant usage on schema public to anon, authenticated, service_role;

revoke all on table public.products, public.pending_parcels, public.batches,
  public.arrival_events, public.forecasts, public.sell_estimates
  from public, anon, authenticated;

grant select on table public.products, public.batches, public.arrival_events,
  public.forecasts, public.sell_estimates to anon, authenticated;
grant all on table public.products, public.pending_parcels, public.batches,
  public.arrival_events, public.forecasts, public.sell_estimates to service_role;

create policy products_public_read on public.products
  for select to anon, authenticated using (true);
create policy batches_public_read on public.batches
  for select to anon, authenticated using (true);
create policy arrival_events_public_read on public.arrival_events
  for select to anon, authenticated using (true);
create policy forecasts_public_read on public.forecasts
  for select to anon, authenticated using (true);
create policy sell_estimates_public_read on public.sell_estimates
  for select to anon, authenticated using (true);

-- Database-side atomic scan transaction. Duplicate scans within 10 seconds
-- return without inserting any event, batch, or other record. Unknown tags are
-- visibly recorded. Successful scan payload is returned to the Edge Function.
create or replace function public.process_scan(
  p_device_id text,
  p_tag_uid text,
  p_quantity integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pending public.pending_parcels%rowtype;
  v_product public.products%rowtype;
  v_batch public.batches%rowtype;
  v_mfg_date date;
  v_expiry_date date;
  v_jitter integer;
begin
  if p_device_id is null or char_length(p_device_id) not between 1 and 128
     or p_tag_uid is null or char_length(p_tag_uid) not between 1 and 128
     or p_quantity is null or p_quantity < 1 or p_quantity > 100000 then
    raise exception using errcode = '22023', message = 'invalid scan arguments';
  end if;

  if exists (
    select 1 from public.arrival_events
    where tag_uid = p_tag_uid
      and result in ('ok', 'unknown_tag')
      and created_at >= now() - interval '10 seconds'
  ) then
    return jsonb_build_object('result', 'duplicate');
  end if;

  select * into v_pending
  from public.pending_parcels
  where tag_uid = p_tag_uid and status = 'pending'
  for update;

  if not found then
    -- Re-check after a possible row-lock wait so simultaneous requests for one
    -- parcel are also classified as duplicates rather than unknown tags.
    if exists (
      select 1 from public.arrival_events
      where tag_uid = p_tag_uid
        and result in ('ok', 'unknown_tag')
        and created_at >= now() - interval '10 seconds'
    ) then
      return jsonb_build_object('result', 'duplicate');
    end if;

    insert into public.arrival_events (device_id, tag_uid, batch_id, result)
    values (p_device_id, p_tag_uid, null, 'unknown_tag');
    return jsonb_build_object('result', 'unknown_tag');
  end if;

  select * into v_product
  from public.products
  where id = v_pending.product_id;

  if not found then
    raise exception using errcode = '23503', message = 'registered product no longer exists';
  end if;

  -- The manufacturing date is assumed to be today (UTC); expiry variation is
  -- simulated within +/- 2 days and never earlier than the assumed date.
  v_mfg_date := (now() at time zone 'UTC')::date;
  v_jitter := floor(random() * 5)::integer - 2;
  v_expiry_date := v_mfg_date + greatest(v_product.shelf_life_days + v_jitter, 0);

  insert into public.batches (
    product_id, tag_uid, quantity, simulated_mfg_date,
    simulated_expiry_date, arrived_at
  ) values (
    v_product.id, v_pending.tag_uid, p_quantity, v_mfg_date,
    v_expiry_date, now()
  ) returning * into v_batch;

  update public.pending_parcels
  set status = 'received', received_at = now()
  where id = v_pending.id;

  insert into public.arrival_events (device_id, tag_uid, batch_id, result)
  values (p_device_id, p_tag_uid, v_batch.id, 'ok');

  -- [FUTURE HOOK: call sell-date recalculation here in the later sell-date task.]
  return jsonb_build_object(
    'result', 'ok',
    'batch_id', v_batch.id,
    'product_id', v_product.id,
    'product_name', v_product.name,
    'category', v_product.category,
    'weight_kg', v_product.weight_kg,
    'quantity', v_batch.quantity,
    'simulated_mfg_date', v_batch.simulated_mfg_date,
    'simulated_expiry_date', v_batch.simulated_expiry_date
  );
end;
$$;

revoke all on function public.process_scan(text, text, integer) from public, anon, authenticated;
grant execute on function public.process_scan(text, text, integer) to service_role;

-- Realtime is enabled only for the three tables required by the TRD.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Supabase publication supabase_realtime is missing';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'arrival_events'
  ) then
    execute 'alter publication supabase_realtime add table public.arrival_events';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'batches'
  ) then
    execute 'alter publication supabase_realtime add table public.batches';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sell_estimates'
  ) then
    execute 'alter publication supabase_realtime add table public.sell_estimates';
  end if;
end;
$$;
