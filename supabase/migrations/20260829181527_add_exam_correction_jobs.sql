create table if not exists public.exam_correction_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'pending'
    check (status in ('pending','reading','grading','finalizing','completed','failed')),
  stage text not null default 'preparing',
  progress integer not null default 0 check (progress between 0 and 100),
  exam_page_count integer not null default 0 check (exam_page_count >= 0),
  answer_key_page_count integer not null default 0 check (answer_key_page_count >= 0),
  manual_exam_text text not null default '',
  manual_answer_key_text text not null default '',
  context jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  retryable boolean not null default true,
  grading_attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

create table if not exists public.exam_correction_pages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.exam_correction_jobs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  page_kind text not null check (page_kind in ('exam','answer_key')),
  page_number integer not null check (page_number > 0),
  status text not null default 'pending'
    check (status in ('pending','reading','ready','failed')),
  transcription text not null default '',
  error_message text,
  attempts integer not null default 0,
  duration_ms integer,
  model_used text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, page_kind, page_number)
);

create index if not exists exam_correction_jobs_owner_updated_idx
  on public.exam_correction_jobs(user_id, updated_at desc);
create index if not exists exam_correction_pages_job_status_idx
  on public.exam_correction_pages(job_id, status);

alter table public.exam_correction_jobs enable row level security;
alter table public.exam_correction_pages enable row level security;

grant select, insert, update, delete on public.exam_correction_jobs to authenticated;
grant select, insert, update, delete on public.exam_correction_pages to authenticated;
grant all on public.exam_correction_jobs to service_role;
grant all on public.exam_correction_pages to service_role;

drop policy if exists exam_correction_jobs_owner_select on public.exam_correction_jobs;
create policy exam_correction_jobs_owner_select on public.exam_correction_jobs
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists exam_correction_jobs_owner_insert on public.exam_correction_jobs;
create policy exam_correction_jobs_owner_insert on public.exam_correction_jobs
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists exam_correction_jobs_owner_update on public.exam_correction_jobs;
create policy exam_correction_jobs_owner_update on public.exam_correction_jobs
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists exam_correction_jobs_owner_delete on public.exam_correction_jobs;
create policy exam_correction_jobs_owner_delete on public.exam_correction_jobs
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists exam_correction_pages_owner_select on public.exam_correction_pages;
create policy exam_correction_pages_owner_select on public.exam_correction_pages
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists exam_correction_pages_owner_insert on public.exam_correction_pages;
create policy exam_correction_pages_owner_insert on public.exam_correction_pages
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists exam_correction_pages_owner_update on public.exam_correction_pages;
create policy exam_correction_pages_owner_update on public.exam_correction_pages
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
drop policy if exists exam_correction_pages_owner_delete on public.exam_correction_pages;
create policy exam_correction_pages_owner_delete on public.exam_correction_pages
  for delete to authenticated using ((select auth.uid()) = owner_id);
