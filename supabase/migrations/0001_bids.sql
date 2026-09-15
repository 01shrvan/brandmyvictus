create table public.bids (
  id uuid primary key default gen_random_uuid(),
  spot_id int not null check (spot_id between 0 and 99),
  amount int not null check (amount > 0 and amount <= 10000000),
  brand text not null check (char_length(brand) between 1 and 40),
  url text not null check (char_length(url) <= 200 and url ~ '^https?://'),
  email text not null check (char_length(email) <= 200),
  ip_hash text not null check (char_length(ip_hash) = 64),
  status text not null default 'leading' check (status in ('pending', 'leading', 'outbid', 'rejected')),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  live_at timestamptz
);

create unique index bids_one_leader on public.bids (spot_id) where status = 'leading';
create index bids_spot_created on public.bids (spot_id, created_at desc);
create index bids_ip_recent on public.bids (ip_hash, created_at desc);
create index bids_email_recent on public.bids (email, created_at desc);

alter table public.bids enable row level security;
revoke all on table public.bids from anon, authenticated;
grant select, insert, update, delete on table public.bids to service_role;

create or replace function public.bid_throttled(p_ip_hash text, p_email text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from public.bids
      where created_at > now() - interval '10 minutes'
        and (ip_hash = p_ip_hash or email = p_email)) >= 6
    or
    (select count(*) from public.bids
      where created_at > now() - interval '10 minutes') >= 120;
$$;

create or replace function public.place_bid(
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
  perform pg_advisory_xact_lock(hashtext('bids'), p_spot);

  if public.bid_throttled(p_ip_hash, p_email) then
    return query select 'rate_limited'::text, null::uuid, null::int, null::int;
    return;
  end if;

  select * into v_lead from public.bids where spot_id = p_spot and status = 'leading';
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

  if v_has_lead then
    update public.bids set status = 'outbid' where id = v_lead.id;
  end if;

  insert into public.bids (spot_id, amount, brand, url, email, ip_hash, status, live_at)
  values (p_spot, p_amount, p_brand, p_url, p_email, p_ip_hash, 'leading', now())
  returning id into v_id;

  return query select 'leading'::text, v_id, p_amount + p_step, greatest((p_amount + p_step) * 3, p_amount + p_step + 5000);
end;
$$;

create or replace function public.request_claim(
  p_spot int,
  p_brand text,
  p_url text,
  p_email text,
  p_ip_hash text,
  p_start int,
  p_step int
)
returns table (result text, amount int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lead_amount int;
  v_price int;
begin
  perform pg_advisory_xact_lock(hashtext('bids'), p_spot);

  if public.bid_throttled(p_ip_hash, p_email) then
    return query select 'rate_limited'::text, null::int;
    return;
  end if;

  select b.amount into v_lead_amount from public.bids b where b.spot_id = p_spot and b.status = 'leading';
  v_price := case when v_lead_amount is null then p_start else v_lead_amount + p_step end;

  insert into public.bids (spot_id, amount, brand, url, email, ip_hash, status)
  values (p_spot, v_price, p_brand, p_url, p_email, p_ip_hash, 'pending');

  return query select 'pending'::text, v_price;
end;
$$;

create or replace function public.approve_bid(p_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.bids set approved = true where id = p_id and status in ('leading', 'outbid');
  return case when found then 'approved' else 'missing' end;
end;
$$;

create or replace function public.reject_bid(p_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bid public.bids%rowtype;
  v_next uuid;
begin
  select * into v_bid from public.bids where id = p_id;
  if not found then
    return 'missing';
  end if;

  perform pg_advisory_xact_lock(hashtext('bids'), v_bid.spot_id);

  update public.bids set status = 'rejected', approved = false where id = p_id;

  if v_bid.status = 'leading' then
    select id into v_next
    from public.bids
    where spot_id = v_bid.spot_id and status = 'outbid'
    order by amount desc, created_at asc
    limit 1;

    if v_next is not null then
      update public.bids set status = 'leading' where id = v_next;
      return 'restored';
    end if;
  end if;

  return 'rejected';
end;
$$;

create or replace function public.confirm_claim(p_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bid public.bids%rowtype;
begin
  select * into v_bid from public.bids where id = p_id and status = 'pending';
  if not found then
    return 'missing';
  end if;

  perform pg_advisory_xact_lock(hashtext('bids'), v_bid.spot_id);

  update public.bids set status = 'outbid' where spot_id = v_bid.spot_id and status = 'leading';
  update public.bids set status = 'leading', approved = true, live_at = now() where id = p_id;

  return 'confirmed';
end;
$$;

revoke all on function public.bid_throttled(text, text) from public, anon, authenticated;
revoke all on function public.place_bid(int, int, text, text, text, text, int, int) from public, anon, authenticated;
revoke all on function public.request_claim(int, text, text, text, text, int, int) from public, anon, authenticated;
revoke all on function public.approve_bid(uuid) from public, anon, authenticated;
revoke all on function public.reject_bid(uuid) from public, anon, authenticated;
revoke all on function public.confirm_claim(uuid) from public, anon, authenticated;

grant execute on function public.bid_throttled(text, text) to service_role;
grant execute on function public.place_bid(int, int, text, text, text, text, int, int) to service_role;
grant execute on function public.request_claim(int, text, text, text, text, int, int) to service_role;
grant execute on function public.approve_bid(uuid) to service_role;
grant execute on function public.reject_bid(uuid) to service_role;
grant execute on function public.confirm_claim(uuid) to service_role;
