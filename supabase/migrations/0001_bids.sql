create table public.bids (
  id uuid primary key default gen_random_uuid(),
  spot_id int not null,
  amount int not null check (amount > 0),
  brand text not null check (char_length(brand) between 1 and 40),
  url text not null check (char_length(url) <= 200),
  email text not null check (char_length(email) <= 200),
  status text not null default 'leading' check (status in ('pending', 'leading', 'outbid', 'rejected')),
  created_at timestamptz not null default now(),
  live_at timestamptz
);

create unique index bids_one_leader on public.bids (spot_id) where status = 'leading';
create index bids_spot_created on public.bids (spot_id, created_at desc);

alter table public.bids enable row level security;

create or replace function public.place_bid(
  p_spot int,
  p_amount int,
  p_brand text,
  p_url text,
  p_email text,
  p_start int,
  p_step int
)
returns table (result text, bid_id uuid, next_min int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.bids%rowtype;
  v_has_lead boolean;
  v_min int;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('bids'), p_spot);

  select * into v_lead from public.bids where spot_id = p_spot and status = 'leading';
  v_has_lead := found;
  v_min := case when v_has_lead then v_lead.amount + p_step else p_start end;

  if p_amount < v_min then
    return query select 'too_low'::text, null::uuid, v_min;
    return;
  end if;

  if v_has_lead then
    update public.bids set status = 'outbid' where id = v_lead.id;
  end if;

  insert into public.bids (spot_id, amount, brand, url, email, status, live_at)
  values (p_spot, p_amount, p_brand, p_url, p_email, 'leading', now())
  returning id into v_id;

  return query select 'leading'::text, v_id, p_amount + p_step;
end;
$$;

create or replace function public.reject_bid(p_id uuid)
returns text
language plpgsql
security definer
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

  update public.bids set status = 'rejected' where id = p_id;

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
security definer
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
  update public.bids set status = 'leading', live_at = now() where id = p_id;

  return 'confirmed';
end;
$$;

revoke all on function public.place_bid(int, int, text, text, text, int, int) from public, anon, authenticated;
revoke all on function public.reject_bid(uuid) from public, anon, authenticated;
revoke all on function public.confirm_claim(uuid) from public, anon, authenticated;
grant execute on function public.place_bid(int, int, text, text, text, int, int) to service_role;
grant execute on function public.reject_bid(uuid) to service_role;
grant execute on function public.confirm_claim(uuid) to service_role;
