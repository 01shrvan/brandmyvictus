alter table public.bids add column sticker_path text check (sticker_path is null or sticker_path ~ '^[0-9a-f-]{36}\.(png|jpg|webp|ico)$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stickers', 'stickers', false, 1048576, array['image/png', 'image/jpeg', 'image/webp', 'image/x-icon'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.admin_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null check (char_length(ip_hash) = 64),
  ok boolean not null,
  created_at timestamptz not null default now()
);

create index admin_attempts_recent on public.admin_attempts (ip_hash, created_at desc);

alter table public.admin_attempts enable row level security;
revoke all on table public.admin_attempts from anon, authenticated;
grant select, insert, delete on table public.admin_attempts to service_role;

create or replace function public.admin_login_allowed(p_ip_hash text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from public.admin_attempts
      where ip_hash = p_ip_hash and not ok and created_at > now() - interval '15 minutes') < 5
    and
    (select count(*) from public.admin_attempts
      where not ok and created_at > now() - interval '15 minutes') < 30;
$$;

revoke all on function public.admin_login_allowed(text) from public, anon, authenticated;
grant execute on function public.admin_login_allowed(text) to service_role;

drop function if exists public.request_claim(int, text, text, text, text, int, int);

create function public.request_claim(
  p_spot int,
  p_brand text,
  p_url text,
  p_email text,
  p_ip_hash text,
  p_start int,
  p_step int
)
returns table (result text, bid_id uuid, amount int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lead_amount int;
  v_price int;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('bids'), p_spot);

  if public.bid_throttled(p_ip_hash, p_email) then
    return query select 'rate_limited'::text, null::uuid, null::int;
    return;
  end if;

  select b.amount into v_lead_amount from public.bids b where b.spot_id = p_spot and b.status = 'leading';
  v_price := case when v_lead_amount is null then p_start else v_lead_amount + p_step end;

  insert into public.bids (spot_id, amount, brand, url, email, ip_hash, status)
  values (p_spot, v_price, p_brand, p_url, p_email, p_ip_hash, 'pending')
  returning id into v_id;

  return query select 'pending'::text, v_id, v_price;
end;
$$;

revoke all on function public.request_claim(int, text, text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.request_claim(int, text, text, text, text, int, int) to service_role;
