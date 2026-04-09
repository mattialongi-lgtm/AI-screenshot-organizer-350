-- ============================================================
-- Migration: Supabase Security Advisor warning fixes
-- Fixes:
--   1. Function Search Path Mutable       -> public.handle_new_user
--   2. Extension in Public                -> public.vector
--
-- Run this in the Supabase SQL Editor once.
-- ============================================================

begin;

-- Keep extensions in a dedicated schema instead of public.
create schema if not exists extensions;

-- Standard Supabase roles may need schema usage for extension-backed types/functions.
grant usage on schema extensions to postgres, anon, authenticated, service_role;

-- Move pgvector out of public when it is installed there.
do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'vector'
      and n.nspname = 'public'
  ) then
    alter extension vector set schema extensions;
  end if;
end
$$;

-- Lock down the search_path for any public.handle_new_user overloads.
-- Compatibility-first choice:
--   use a fixed path (public, auth) so existing unqualified references
--   keep working, while still removing the mutable search_path warning.
--
-- Stronger hardening option for later:
--   set search_path = '';
-- but only after every object inside the function is schema-qualified.
do $$
declare
  fn record;
begin
  for fn in
    select format(
      '%I.%I(%s)',
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    ) as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'handle_new_user'
  loop
    execute format(
      'alter function %s set search_path = public, auth',
      fn.signature
    );
  end loop;
end
$$;

commit;
