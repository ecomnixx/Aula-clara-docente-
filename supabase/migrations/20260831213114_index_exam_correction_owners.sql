create index if not exists exam_correction_grading_blocks_owner_idx
  on public.exam_correction_grading_blocks(owner_id);
create index if not exists exam_correction_pages_owner_idx
  on public.exam_correction_pages(owner_id);
