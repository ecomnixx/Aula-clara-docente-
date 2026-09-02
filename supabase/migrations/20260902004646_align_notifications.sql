create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('ACCOUNT','APP_UPDATE','CONTENT_READY','CORRECTION_READY','SLIDES_READY','ASSESSMENT_READY','SYSTEM')),
  title text not null check (char_length(title) between 1 and 160),
  message text not null check (char_length(message) between 1 and 500),
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);
create index if not exists notifications_owner_unread_idx on public.notifications(user_id, read_at, created_at desc);
alter table public.notifications enable row level security;
grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
drop policy if exists notifications_owner_select on public.notifications;
create policy notifications_owner_select on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists notifications_owner_insert on public.notifications;
create policy notifications_owner_insert on public.notifications for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update on public.notifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists notifications_owner_delete on public.notifications;
create policy notifications_owner_delete on public.notifications for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.presentation_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  presentation_job_id uuid not null references public.presentation_jobs(id) on delete cascade,
  public_token text not null unique check (char_length(public_token) >= 32),
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, presentation_job_id)
);
alter table public.presentation_shares enable row level security;
grant select, insert, update, delete on public.presentation_shares to authenticated;
grant all on public.presentation_shares to service_role;
drop policy if exists presentation_shares_owner_select on public.presentation_shares;
create policy presentation_shares_owner_select on public.presentation_shares for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists presentation_shares_owner_insert on public.presentation_shares;
create policy presentation_shares_owner_insert on public.presentation_shares for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists presentation_shares_owner_update on public.presentation_shares;
create policy presentation_shares_owner_update on public.presentation_shares for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists presentation_shares_owner_delete on public.presentation_shares;
create policy presentation_shares_owner_delete on public.presentation_shares for delete to authenticated using ((select auth.uid()) = user_id);

create schema if not exists private;
create or replace function private.copy_admin_notification_to_master()
returns trigger language plpgsql security definer set search_path = '' as $$
declare master_id uuid;
begin
  select id into master_id from auth.users where lower(email) = 'ecomnixx@gmail.com' limit 1;
  if master_id is not null then
    insert into public.notifications(user_id,type,title,message,metadata,idempotency_key,created_at)
    values(master_id,'ACCOUNT',new.title,new.body,jsonb_build_object('targetEmail',new.target_email,'adminNotificationId',new.id),new.event_key,new.created_at)
    on conflict(user_id,idempotency_key) do nothing;
  end if;
  return new;
end; $$;
revoke all on function private.copy_admin_notification_to_master() from public, anon, authenticated;
drop trigger if exists copy_admin_notification_to_master on public.admin_notifications;
create trigger copy_admin_notification_to_master after insert on public.admin_notifications for each row execute function private.copy_admin_notification_to_master();

insert into public.notifications(user_id,type,title,message,metadata,idempotency_key,created_at,read_at)
select u.id,'ACCOUNT',a.title,a.body,jsonb_build_object('targetEmail',a.target_email,'adminNotificationId',a.id),a.event_key,a.created_at,a.read_at
from public.admin_notifications a cross join lateral (select id from auth.users where lower(email)='ecomnixx@gmail.com' limit 1) u
on conflict(user_id,idempotency_key) do nothing;

create or replace function public.get_shared_presentation(share_token text)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object('deck', j.deck, 'title', j.deck->>'title')
  from public.presentation_shares s join public.presentation_jobs j on j.id = s.presentation_job_id
  where s.public_token = share_token and s.is_active = true and (s.expires_at is null or s.expires_at > now()) and j.status = 'completed'
  limit 1;
$$;
revoke all on function public.get_shared_presentation(text) from public, authenticated;
grant execute on function public.get_shared_presentation(text) to anon;
