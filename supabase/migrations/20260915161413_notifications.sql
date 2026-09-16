alter table public.bids add column winner_notified_at timestamptz;

drop function if exists public.place_bid(int, int, text, text, text, text, int, int);

create function public.place_bid(
  p_spot int,
  p_amount int,
  p_brand text,
  p_url text,
  p_email text,
  p_ip_hash text,
  p_start int,
  p_step int
)
returns table (result text, bid_id uuid, next_min int, max_amount int, outbid_email text)
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
  perform pg_advisory_xact_lock(hashtext('bids'), p_spot);

  if public.bid_throttled(p_ip_hash, p_email) then
    return query select 'rate_limited'::text, null::uuid, null::int, null::int, null::text;
    return;
  end if;

  select * into v_lead from public.bids where spot_id = p_spot and status = 'leading';
  v_has_lead := found;
  v_min := case when v_has_lead then v_lead.amount + p_step else p_start end;
  v_max := greatest(v_min * 3, v_min + 5000);

  if p_amount < v_min then
    return query select 'too_low'::text, null::uuid, v_min, v_max, null::text;
    return;
  end if;

  if p_amount > v_max then
    return query select 'too_high'::text, null::uuid, v_min, v_max, null::text;
    return;
  end if;

  if v_has_lead then
    update public.bids set status = 'outbid' where id = v_lead.id;
  end if;

  insert into public.bids (spot_id, amount, brand, url, email, ip_hash, status, live_at)
  values (p_spot, p_amount, p_brand, p_url, p_email, p_ip_hash, 'leading', now())
  returning id into v_id;

  return query select
    'leading'::text,
    v_id,
    p_amount + p_step,
    greatest((p_amount + p_step) * 3, p_amount + p_step + 5000),
    case when v_has_lead and v_lead.email <> p_email then v_lead.email else null end;
end;
$$;

revoke all on function public.place_bid(int, int, text, text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.place_bid(int, int, text, text, text, text, int, int) to service_role;
