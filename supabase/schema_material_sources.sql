-- Aula Clara: fontes persistentes e isoladas por professor.
-- Execute no SQL Editor do projeto Supabase antes de publicar esta versão.

create table if not exists public.material_sources (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  source_type text not null default 'images' check (source_type in ('images','pdf','mixed')),
  total_pages integer not null default 0 check (total_pages >= 0),
  processing_status text not null default 'review' check (processing_status in ('uploading','review','processing','ready','partial_error','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_source_pages (
  id uuid primary key,
  material_id uuid not null references public.material_sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null default 0,
  width integer,
  height integer,
  processing_status text not null default 'stored' check (processing_status in ('uploading','stored','preparing','queued','reading','processing','ready','error')),
  extracted_text text,
  structured_content jsonb,
  processing_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(material_id, page_number)
);

create table if not exists public.material_source_chunks (
  id bigint generated always as identity primary key,
  material_id uuid not null references public.material_sources(id) on delete cascade,
  page_id uuid not null references public.material_source_pages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  page_number integer not null,
  chunk_index integer not null,
  section text,
  title text,
  content text not null,
  created_at timestamptz not null default now(),
  unique(page_id, chunk_index)
);

create index if not exists material_sources_user_updated_idx on public.material_sources(user_id, updated_at desc);
create index if not exists material_source_pages_material_page_idx on public.material_source_pages(material_id, page_number);
create index if not exists material_source_chunks_material_page_idx on public.material_source_chunks(material_id, page_number, chunk_index);
create index if not exists material_source_pages_user_idx on public.material_source_pages(user_id);
create index if not exists material_source_chunks_user_idx on public.material_source_chunks(user_id);

alter table public.material_sources enable row level security;
alter table public.material_source_pages enable row level security;
alter table public.material_source_chunks enable row level security;

drop policy if exists "owners manage material sources" on public.material_sources;
create policy "owners manage material sources" on public.material_sources
for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "owners manage material source pages" on public.material_source_pages;
create policy "owners manage material source pages" on public.material_source_pages
for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "owners manage material source chunks" on public.material_source_chunks;
create policy "owners manage material source chunks" on public.material_source_chunks
for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.material_sources to authenticated;
grant select, insert, update, delete on public.material_source_pages to authenticated;
grant select, insert, update, delete on public.material_source_chunks to authenticated;
grant usage, select on sequence public.material_source_chunks_id_seq to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('material-sources', 'material-sources', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owners read source objects" on storage.objects;
create policy "owners read source objects" on storage.objects for select to authenticated
using (bucket_id = 'material-sources' and (storage.foldername(name))[2] = (select auth.uid())::text);

drop policy if exists "owners upload source objects" on storage.objects;
create policy "owners upload source objects" on storage.objects for insert to authenticated
with check (bucket_id = 'material-sources' and (storage.foldername(name))[2] = (select auth.uid())::text);

drop policy if exists "owners update source objects" on storage.objects;
create policy "owners update source objects" on storage.objects for update to authenticated
using (bucket_id = 'material-sources' and (storage.foldername(name))[2] = (select auth.uid())::text)
with check (bucket_id = 'material-sources' and (storage.foldername(name))[2] = (select auth.uid())::text);

drop policy if exists "owners delete source objects" on storage.objects;
create policy "owners delete source objects" on storage.objects for delete to authenticated
using (bucket_id = 'material-sources' and (storage.foldername(name))[2] = (select auth.uid())::text);
