create table if not exists public.school_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  is_default boolean not null default false,
  template_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists school_templates_owner_updated_idx on public.school_templates(user_id, updated_at desc);
create unique index if not exists school_templates_one_default_per_user on public.school_templates(user_id) where is_default;
alter table public.school_templates enable row level security;
grant select, insert, update, delete on public.school_templates to authenticated;
grant all on public.school_templates to service_role;
create policy school_templates_owner_select on public.school_templates for select to authenticated using ((select auth.uid()) = user_id);
create policy school_templates_owner_insert on public.school_templates for insert to authenticated with check ((select auth.uid()) = user_id);
create policy school_templates_owner_update on public.school_templates for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy school_templates_owner_delete on public.school_templates for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.assessment_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  public_token text not null unique check (char_length(public_token) >= 32),
  title text not null,
  snapshot jsonb not null,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists assessment_shares_owner_created_idx on public.assessment_shares(user_id, created_at desc);
alter table public.assessment_shares enable row level security;
grant select, insert, update, delete on public.assessment_shares to authenticated;
grant all on public.assessment_shares to service_role;
create policy assessment_shares_owner_select on public.assessment_shares for select to authenticated using ((select auth.uid()) = user_id);
create policy assessment_shares_owner_insert on public.assessment_shares for insert to authenticated with check ((select auth.uid()) = user_id);
create policy assessment_shares_owner_update on public.assessment_shares for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy assessment_shares_owner_delete on public.assessment_shares for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.set_single_default_school_template(target_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.school_templates set is_default = false, updated_at = now() where user_id = (select auth.uid());
  update public.school_templates set is_default = true, updated_at = now() where id = target_id and user_id = (select auth.uid());
end; $$;
grant execute on function public.set_single_default_school_template(uuid) to authenticated;

create or replace function public.get_shared_assessment(share_token text)
returns jsonb language sql security definer set search_path = public stable as $$
  select snapshot from public.assessment_shares
  where public_token = share_token and is_active = true and (expires_at is null or expires_at > now())
  limit 1;
$$;
revoke all on function public.get_shared_assessment(text) from public;
grant execute on function public.get_shared_assessment(text) to anon, authenticated;
