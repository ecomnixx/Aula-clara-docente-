alter table public.exam_correction_jobs drop constraint if exists exam_correction_jobs_status_check;

update public.exam_correction_jobs j
set status = case
  when j.status = 'completed' then 'completed'
  when j.status = 'grading' or j.status = 'finalizing' then 'grading_retry'
  when j.status = 'reading' then 'ocr_processing'
  when j.status = 'failed' and not exists (
    select 1 from public.exam_correction_pages p
    where p.job_id = j.id and p.status <> 'ready'
  ) then 'grading_retry'
  when j.status = 'failed' then 'failed'
  when exists (
    select 1 from public.exam_correction_pages p
    where p.job_id = j.id and p.status <> 'ready'
  ) then 'ocr_pending'
  else 'grading_pending'
end;

alter table public.exam_correction_jobs
  alter column status set default 'ocr_pending';
alter table public.exam_correction_jobs
  add constraint exam_correction_jobs_status_check check (status in (
    'ocr_pending', 'ocr_processing', 'ocr_complete',
    'grading_pending', 'grading_processing', 'grading_retry',
    'completed', 'failed',
    'pending', 'reading', 'grading', 'finalizing'
  ));

create table if not exists public.exam_correction_grading_blocks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.exam_correction_jobs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  block_index integer not null check (block_index >= 0),
  input_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'completed', 'failed')),
  result jsonb,
  attempts integer not null default 0,
  duration_ms integer,
  model_used text,
  provider_status text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (job_id, block_index)
);

create index if not exists exam_correction_grading_blocks_job_status_idx
  on public.exam_correction_grading_blocks(job_id, status, block_index);

alter table public.exam_correction_grading_blocks enable row level security;
grant select, insert, update, delete on public.exam_correction_grading_blocks to authenticated;
grant all on public.exam_correction_grading_blocks to service_role;

drop policy if exists exam_correction_grading_blocks_owner_select on public.exam_correction_grading_blocks;
create policy exam_correction_grading_blocks_owner_select on public.exam_correction_grading_blocks
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists exam_correction_grading_blocks_owner_insert on public.exam_correction_grading_blocks;
create policy exam_correction_grading_blocks_owner_insert on public.exam_correction_grading_blocks
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists exam_correction_grading_blocks_owner_update on public.exam_correction_grading_blocks;
create policy exam_correction_grading_blocks_owner_update on public.exam_correction_grading_blocks
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
drop policy if exists exam_correction_grading_blocks_owner_delete on public.exam_correction_grading_blocks;
create policy exam_correction_grading_blocks_owner_delete on public.exam_correction_grading_blocks
  for delete to authenticated using ((select auth.uid()) = owner_id);
