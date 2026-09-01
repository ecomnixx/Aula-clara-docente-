create table if not exists public.presentation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  stage text not null default 'preparing' check (stage in ('preparing','planning','generating_assets','assembling','reviewing','completed','failed')),
  progress integer not null default 0 check (progress between 0 and 100),
  request_payload jsonb not null default '{}'::jsonb,
  deck jsonb,
  provider_metadata jsonb not null default '{}'::jsonb,
  error_message text,
  retryable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

create index if not exists presentation_jobs_owner_updated_idx on public.presentation_jobs(user_id, updated_at desc);
alter table public.presentation_jobs enable row level security;
grant select, insert, update, delete on public.presentation_jobs to authenticated;
grant all on public.presentation_jobs to service_role;

drop policy if exists presentation_jobs_owner_select on public.presentation_jobs;
create policy presentation_jobs_owner_select on public.presentation_jobs for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists presentation_jobs_owner_insert on public.presentation_jobs;
create policy presentation_jobs_owner_insert on public.presentation_jobs for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists presentation_jobs_owner_update on public.presentation_jobs;
create policy presentation_jobs_owner_update on public.presentation_jobs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists presentation_jobs_owner_delete on public.presentation_jobs;
create policy presentation_jobs_owner_delete on public.presentation_jobs for delete to authenticated using ((select auth.uid()) = user_id);
