-- ============================================================
-- Migration: cloud_sources table + screenshots columns
-- Run this in the Supabase SQL Editor once.
-- ============================================================

-- 1. Cloud sources table
-- Drop first so we always get the correct schema (safe: no real data yet)
drop table if exists public.cloud_sources cascade;

create table public.cloud_sources (
  id             text primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  type           text not null check (type in ('google_drive', 'icloud_folder')),
  email          text,
  local_path     text,
  last_sync      timestamptz,
  status         text not null default 'connected'
                   check (status in ('connected', 'error')),
  connected_at   timestamptz not null default now(),
  settings       jsonb,
  access_token   text,
  refresh_token  text
);

-- Index for per-user lookups
create index cloud_sources_user_id_idx
  on public.cloud_sources (user_id);

-- Enable RLS
alter table public.cloud_sources enable row level security;

-- Users can only see and manage their own sources
-- (drop first to make the script safely re-runnable)
do $$ begin
  create policy "Users manage own cloud sources"
    on public.cloud_sources
    for all
    using  (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

-- Service role bypass (needed by the backend)
do $$ begin
  create policy "Service role full access"
    on public.cloud_sources
    for all
    to service_role
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;

-- ============================================================
-- 2. Add source tracking columns to the screenshots table
--    (safe: does nothing if the columns already exist)
-- ============================================================

alter table public.screenshots
  add column if not exists source_id    text,
  add column if not exists external_id  text;

create index if not exists screenshots_external_id_idx
  on public.screenshots (external_id);
