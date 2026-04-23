-- ============================================================
-- Migration: additive cloud_sources hardening + import identity
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- 1. Cloud sources table
create table if not exists public.cloud_sources (
  id             text primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  type           text not null,
  email          text,
  last_sync      timestamptz,
  status         text not null default 'connected',
  connected_at   timestamptz not null default now(),
  settings       jsonb,
  access_token   text,
  refresh_token  text
);

alter table public.cloud_sources
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists type text,
  add column if not exists email text,
  add column if not exists last_sync timestamptz,
  add column if not exists status text,
  add column if not exists connected_at timestamptz,
  add column if not exists settings jsonb,
  add column if not exists access_token text,
  add column if not exists refresh_token text;

alter table public.cloud_sources
  alter column status set default 'connected',
  alter column connected_at set default now();

update public.cloud_sources
set status = 'connected'
where status is null;

update public.cloud_sources
set connected_at = now()
where connected_at is null;

create index if not exists cloud_sources_user_id_idx
  on public.cloud_sources (user_id);

alter table public.cloud_sources enable row level security;

do $$
begin
  alter table public.cloud_sources
    add constraint cloud_sources_supported_type_check
    check (type = 'google_drive') not valid;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.cloud_sources
    add constraint cloud_sources_supported_status_check
    check (status in ('connected', 'error')) not valid;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy "Users manage own cloud sources"
    on public.cloud_sources
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy "Service role full access"
    on public.cloud_sources
    for all
    to service_role
    using (true)
    with check (true);
exception
  when duplicate_object then null;
end
$$;

-- 2. Screenshot import identity
alter table public.screenshots
  add column if not exists source_id text,
  add column if not exists external_id text;

create index if not exists screenshots_external_id_idx
  on public.screenshots (external_id);

with ranked_imports as (
  select
    id,
    row_number() over (
      partition by user_id, source_id, external_id
      order by id
    ) as duplicate_rank
  from public.screenshots
  where source_id is not null
    and external_id is not null
)
update public.screenshots as screenshots
set external_id = screenshots.external_id || '#duplicate:' || screenshots.id::text
from ranked_imports
where screenshots.id = ranked_imports.id
  and ranked_imports.duplicate_rank > 1;

create unique index if not exists screenshots_source_import_identity_uidx
  on public.screenshots (user_id, source_id, external_id)
  where source_id is not null
    and external_id is not null;
