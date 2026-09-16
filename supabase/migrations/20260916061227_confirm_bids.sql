alter table public.bids drop constraint bids_status_check;
alter table public.bids add constraint bids_status_check
  check (status in ('unconfirmed', 'pending', 'leading', 'outbid', 'rejected'));

create or replace function public.stage_bid(
  p_spot int,
  p_amount int,
  p_brand text,
  p_url text,
  p_email text,
  p_ip_hash text,
  p_start int,
  p_step int
)
returns table (result text, bid_id uuid, next_min int, max_amount int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lead public.bids%rowtype;
  v_has_lead boolean;
  v_min int;
  v_max int;
  v_id uuid;
begin
  if public.bid_throttled(p_ip_hash, p_email) then
    return query select 'rate_limited'::text, null::uuid, null::int, null::int;
    return;
  end if;

  select b.* into v_lead from public.bids b where b.spot_id = p_spot and b.status = 'leading';
  v_has_lead := found;
  v_min := case when v_has_lead then v_lead.amount + p_step else p_start end;
  v_max := greatest(v_min * 3, v_min + 5000);

  if p_amount < v_min then
    return query select 'too_low'::text, null::uuid, v_min, v_max;
    return;
  end if;

  if p_amount > v_max then
    return query select 'too_high'::text, null::uuid, v_min, v_max;
    return;
  end if;

  insert into public.bids (spot_id, amount, brand, url, email, ip_hash, status)
  values (p_spot, p_amount, p_brand, p_url, p_email, p_ip_hash, 'unconfirmed')
  returning id into v_id;

  return query select 'staged'::text, v_id, v_min, v_max;
end;
$$;

create or replace function public.confirm_bid(p_id uuid, p_start int, p_step int)
returns table (result text, next_min int, max_amount int, outbid_email text, spot_id int, amount int, brand text, url text, email text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bid public.bids%rowtype;
  v_lead public.bids%rowtype;
  v_has_lead boolean;
  v_min int;
begin
  select b.* into v_bid from public.bids b where b.id = p_id for update;
  if not found or v_bid.status <> 'unconfirmed' then
    return query select 'missing'::text, null::int, null::int, null::text, null::int, null::int, null::text, null::text, null::text;
    return;
  end if;

  if v_bid.created_at < now() - interval '2 hours' then
    update public.bids set status = 'rejected' where id = p_id;
    return query select 'expired'::text, null::int, null::int, null::text, null::int, null::int, null::text, null::text, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('bids'), v_bid.spot_id);

  select b.* into v_lead from public.bids b where b.spot_id = v_bid.spot_id and b.status = 'leading';
  v_has_lead := found;
  v_min := case when v_has_lead then v_lead.amount + p_step else p_start end;

  if v_bid.amount < v_min then
    update public.bids set status = 'rejected' where id = p_id;
    return query select 'too_low'::text, v_min, greatest(v_min * 3, v_min + 5000), null::text, v_bid.spot_id, v_bid.amount, v_bid.brand, v_bid.url, v_bid.email;
    return;
  end if;

  if v_has_lead then
    update public.bids set status = 'outbid' where id = v_lead.id;
  end if;

  update public.bids set status = 'leading', live_at = now() where id = p_id;

  return query select
    'leading'::text,
    v_bid.amount + p_step,
    greatest((v_bid.amount + p_step) * 3, v_bid.amount + p_step + 5000),
    case when v_has_lead and v_lead.email <> v_bid.email then v_lead.email else null end,
    v_bid.spot_id,
    v_bid.amount,
    v_bid.brand,
    v_bid.url,
    v_bid.email;
end;
$$;

create index if not exists bids_unconfirmed on public.bids (status, created_at desc) where status = 'unconfirmed';

revoke all on function public.stage_bid(int, int, text, text, text, text, int, int) from public, anon, authenticated;
revoke all on function public.confirm_bid(uuid, int, int) from public, anon, authenticated;
grant execute on function public.stage_bid(int, int, text, text, text, text, int, int) to service_role;
grant execute on function public.confirm_bid(uuid, int, int) to service_role;
