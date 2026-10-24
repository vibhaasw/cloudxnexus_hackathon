-- Smart Warehouse IoT - Sell-Date Estimation (TRD Section 6)
-- Adds status and range columns to sell_estimates, creates recalculate_sell_estimates(),
-- and updates process_scan() to trigger recalculation on every scan.

-- 1. Extend sell_estimates table with status and uncertainty range columns
alter table public.sell_estimates
  add column if not exists status text default 'calculated'
    check (status in ('calculated', 'beyond_horizon', 'unknown')),
  add column if not exists range_earliest_date date,
  add column if not exists range_latest_date date;

-- 2. Create the core sell-date estimation procedure
create or replace function public.recalculate_sell_estimates(p_product_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prod record;
  v_batch record;
  v_forecast_count integer;
  v_max_forecast_date date;
  v_cum_qty numeric;
  v_est_date date;
  v_earliest_date date;
  v_latest_date date;
  v_status text;
  v_expiry_risk boolean;
  v_start_date date;
begin
  -- Loop over specified product or all products if null
  for v_prod in
    select id from public.products
    where (p_product_id is null or id = p_product_id)
  loop
    -- Determine start date for forecast evaluation (earliest forecast >= current_date, or min date)
    select coalesce(
      (select min(forecast_date) from public.forecasts where product_id = v_prod.id and forecast_date >= current_date),
      (select min(forecast_date) from public.forecasts where product_id = v_prod.id)
    ) into v_start_date;

    -- Count available forecast days from start date
    select count(*), max(forecast_date)
    into v_forecast_count, v_max_forecast_date
    from public.forecasts
    where product_id = v_prod.id
      and (v_start_date is null or forecast_date >= v_start_date);

    if v_forecast_count = 0 or v_start_date is null then
      -- No forecast rows: do not crash, mark status as 'unknown'
      insert into public.sell_estimates (
        batch_id, estimated_sell_date, expiry_risk, status, range_earliest_date, range_latest_date, computed_at
      )
      select
        b.id,
        null,
        null,
        'unknown',
        null,
        null,
        now()
      from public.batches b
      where b.product_id = v_prod.id
      on conflict (batch_id) do update set
        estimated_sell_date = excluded.estimated_sell_date,
        expiry_risk = excluded.expiry_risk,
        status = excluded.status,
        range_earliest_date = excluded.range_earliest_date,
        range_latest_date = excluded.range_latest_date,
        computed_at = excluded.computed_at;
    else
      -- Forecasts exist: order batches oldest first (arrived_at asc, id asc)
      v_cum_qty := 0;

      for v_batch in
        select
          b.id,
          b.quantity,
          b.simulated_expiry_date,
          b.arrived_at
        from public.batches b
        where b.product_id = v_prod.id
        order by b.arrived_at asc, b.id asc
      loop
        v_cum_qty := v_cum_qty + v_batch.quantity;

        -- 1. Median sell date (p50 demand)
        select f.forecast_date
        into v_est_date
        from (
          select
            forecast_date,
            sum(p50) over (order by forecast_date asc) as cum_demand
          from public.forecasts
          where product_id = v_prod.id
            and forecast_date >= v_start_date
        ) f
        where f.cum_demand >= v_cum_qty
        order by f.forecast_date asc
        limit 1;

        -- 2. Optional earliest date (p90 demand, depletes faster)
        select f.forecast_date
        into v_earliest_date
        from (
          select
            forecast_date,
            sum(p90) over (order by forecast_date asc) as cum_demand
          from public.forecasts
          where product_id = v_prod.id
            and forecast_date >= v_start_date
        ) f
        where f.cum_demand >= v_cum_qty
        order by f.forecast_date asc
        limit 1;

        -- 3. Optional latest date (p10 demand, depletes slower)
        select f.forecast_date
        into v_latest_date
        from (
          select
            forecast_date,
            sum(p10) over (order by forecast_date asc) as cum_demand
          from public.forecasts
          where product_id = v_prod.id
            and forecast_date >= v_start_date
        ) f
        where f.cum_demand >= v_cum_qty
        order by f.forecast_date asc
        limit 1;

        -- Determine status and expiry risk
        if v_est_date is not null then
          v_status := 'calculated';
          -- expiry_risk is true when estimated sell date is later than simulated expiry date
          v_expiry_risk := (v_est_date > v_batch.simulated_expiry_date);
        else
          -- Batch outlasts the forecast horizon
          v_status := 'beyond_horizon';
          if v_batch.simulated_expiry_date <= v_max_forecast_date then
            v_expiry_risk := true;
          else
            v_expiry_risk := null;
          end if;
        end if;

        -- Write results to sell_estimates
        insert into public.sell_estimates (
          batch_id,
          estimated_sell_date,
          expiry_risk,
          status,
          range_earliest_date,
          range_latest_date,
          computed_at
        ) values (
          v_batch.id,
          v_est_date,
          v_expiry_risk,
          v_status,
          v_earliest_date,
          v_latest_date,
          now()
        )
        on conflict (batch_id) do update set
          estimated_sell_date = excluded.estimated_sell_date,
          expiry_risk = excluded.expiry_risk,
          status = excluded.status,
          range_earliest_date = excluded.range_earliest_date,
          range_latest_date = excluded.range_latest_date,
          computed_at = excluded.computed_at;

      end loop;
    end if;
  end loop;
end;
$$;

revoke all on function public.recalculate_sell_estimates(uuid) from public, anon, authenticated;
grant execute on function public.recalculate_sell_estimates(uuid) to service_role;

-- 3. Update process_scan() to call recalculate_sell_estimates() on every scan
create or replace function public.process_scan(
  p_device_id text,
  p_tag_uid text,
  p_quantity integer
)
returns jsonb
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
  v_est_sell_date date;
  v_expiry_risk boolean;
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
    raise exception using errcode = '22023', message = 'referenced product missing';
  end if;

  -- Manufacturing date is UTC today
  v_mfg_date := (now() at time zone 'utc')::date;
  -- Jitter: -2 to +2 days applied to the simulated shelf life
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

  -- Recompute sell-date estimates for this product
  perform public.recalculate_sell_estimates(v_product.id);

  select estimated_sell_date, expiry_risk
  into v_est_sell_date, v_expiry_risk
  from public.sell_estimates
  where batch_id = v_batch.id;

  return jsonb_build_object(
    'result', 'ok',
    'batch_id', v_batch.id,
    'product_id', v_product.id,
    'product_name', v_product.name,
    'category', v_product.category,
    'weight_kg', v_product.weight_kg,
    'quantity', v_batch.quantity,
    'simulated_mfg_date', v_batch.simulated_mfg_date,
    'simulated_expiry_date', v_batch.simulated_expiry_date,
    'estimated_sell_date', v_est_sell_date,
    'expiry_risk', v_expiry_risk
  );
end;
$$;

revoke all on function public.process_scan(text, text, integer) from public, anon, authenticated;
grant execute on function public.process_scan(text, text, integer) to service_role;
