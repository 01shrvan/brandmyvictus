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
      where not ok and created_at > now() - interval '15 minutes') < 10;
$$;

create or replace function public.mail_throttled(p_email text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select count(*) > 1 from public.bids
  where email = p_email and created_at > now() - interval '30 minutes';
$$;

revoke all on function public.mail_throttled(text) from public, anon, authenticated;
grant execute on function public.mail_throttled(text) to service_role;
