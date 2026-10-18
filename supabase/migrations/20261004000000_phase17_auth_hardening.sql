-- Phase 17: close two ways a user could make themselves staff.
--
-- 1. handle_new_user took platform_role from raw_user_meta_data, which the person
--    signing up chooses (supabase.auth.signUp({ options: { data } })). It now reads
--    raw_app_meta_data, which only the service role can set.
-- 2. "Users update own profile" covered every column, so a client could PATCH their
--    own platform_role to 'admin'. Signed-in users may now change only full_name;
--    roles change through the service role (seed script, staff API routes).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, platform_role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_app_meta_data ->> 'platform_role', 'business_owner')
  );
  return new;
end;
$$;

revoke update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;
