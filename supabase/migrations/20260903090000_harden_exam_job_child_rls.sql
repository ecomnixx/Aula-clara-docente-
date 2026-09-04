-- Child records must belong both to the authenticated user and to that user's job.
drop policy if exists exam_correction_pages_owner_select on public.exam_correction_pages;
create policy exam_correction_pages_owner_select on public.exam_correction_pages
  for select to authenticated using (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.exam_correction_jobs j
      where j.id = job_id and j.user_id = (select auth.uid())
    )
  );
drop policy if exists exam_correction_pages_owner_insert on public.exam_correction_pages;
create policy exam_correction_pages_owner_insert on public.exam_correction_pages
  for insert to authenticated with check (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.exam_correction_jobs j
      where j.id = job_id and j.user_id = (select auth.uid())
    )
  );
drop policy if exists exam_correction_pages_owner_update on public.exam_correction_pages;
create policy exam_correction_pages_owner_update on public.exam_correction_pages
  for update to authenticated using (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.exam_correction_jobs j
      where j.id = job_id and j.user_id = (select auth.uid())
    )
  ) with check (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.exam_correction_jobs j
      where j.id = job_id and j.user_id = (select auth.uid())
    )
  );
drop policy if exists exam_correction_pages_owner_delete on public.exam_correction_pages;
create policy exam_correction_pages_owner_delete on public.exam_correction_pages
  for delete to authenticated using (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.exam_correction_jobs j
      where j.id = job_id and j.user_id = (select auth.uid())
    )
  );

drop policy if exists exam_correction_grading_blocks_owner_select on public.exam_correction_grading_blocks;
create policy exam_correction_grading_blocks_owner_select on public.exam_correction_grading_blocks
  for select to authenticated using (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.exam_correction_jobs j
      where j.id = job_id and j.user_id = (select auth.uid())
    )
  );
drop policy if exists exam_correction_grading_blocks_owner_insert on public.exam_correction_grading_blocks;
create policy exam_correction_grading_blocks_owner_insert on public.exam_correction_grading_blocks
  for insert to authenticated with check (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.exam_correction_jobs j
      where j.id = job_id and j.user_id = (select auth.uid())
    )
  );
drop policy if exists exam_correction_grading_blocks_owner_update on public.exam_correction_grading_blocks;
create policy exam_correction_grading_blocks_owner_update on public.exam_correction_grading_blocks
  for update to authenticated using (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.exam_correction_jobs j
      where j.id = job_id and j.user_id = (select auth.uid())
    )
  ) with check (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.exam_correction_jobs j
      where j.id = job_id and j.user_id = (select auth.uid())
    )
  );
drop policy if exists exam_correction_grading_blocks_owner_delete on public.exam_correction_grading_blocks;
create policy exam_correction_grading_blocks_owner_delete on public.exam_correction_grading_blocks
  for delete to authenticated using (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.exam_correction_jobs j
      where j.id = job_id and j.user_id = (select auth.uid())
    )
  );
