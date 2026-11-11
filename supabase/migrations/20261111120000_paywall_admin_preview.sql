-- Admins test the paywall before launch (#262, stage 2 of the Pro launch).
-- While `paywall_preview_admins` is 'true', an admin (app_metadata.role = "admin") gets both
-- switches as if they were on: the database locks paid stats for them (has_feature) and
-- my_membership() tells the apps to show upgrade prompts and the paywall (paywall_preview).
-- Everyone else is unaffected. Turn it off once Pro is live, or to see the app as a user would.

insert into public.app_config (key, value) values ('paywall_preview_admins', 'true')
on conflict (key) do nothing;

create function public.paywall_preview()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
     and coalesce((select value from public.app_config where key = 'paywall_preview_admins'), 'false') = 'true';
$$;

revoke all on function public.paywall_preview() from public, anon;
grant execute on function public.paywall_preview() to authenticated;

create or replace function public.has_feature(feature text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  required text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select fa.tier into required from public.feature_access fa where fa.feature = has_feature.feature;
  if required is null then
    return false;
  end if;

  if required = 'free'
     or (coalesce((select value from public.app_config where key = 'paywall_gates_enabled'), 'false') <> 'true'
         and not public.paywall_preview()) then
    return true;
  end if;

  return public.effective_membership(auth.uid()) ->> 'tier' = 'pro';
end;
$$;

create or replace function public.my_membership()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return public.effective_membership(auth.uid())
    || jsonb_build_object('paywall_preview', public.paywall_preview());
end;
$$;
