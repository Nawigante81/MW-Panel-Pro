-- Email queue + templates (multi-tenant, RLS-ready)
-- MWPanel / Supabase

create extension if not exists pgcrypto;

-- Helper: best-effort organization resolver for current user.
-- Priority:
-- 1) JWT custom claim organization_id / agency_id
-- 2) organization_members table (if exists)
-- 3) memberships table (if exists)
-- 4) profiles table (if exists, organization_id or agency_id)
create or replace function public.current_organization_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_uid uuid;
begin
  begin
    v_org := nullif(auth.jwt() ->> 'organization_id', '')::uuid;
  exception when others then
    v_org := null;
  end;

  if v_org is not null then
    return v_org;
  end if;

  begin
    v_org := nullif(auth.jwt() ->> 'agency_id', '')::uuid;
  exception when others then
    v_org := null;
  end;

  if v_org is not null then
    return v_org;
  end if;

  v_uid := auth.uid();
  if v_uid is null then
    return null;
  end if;

  if to_regclass('public.organization_members') is not null then
    execute 'select om.organization_id from public.organization_members om where om.user_id = $1 limit 1'
      into v_org
      using v_uid;
    if v_org is not null then
      return v_org;
    end if;
  end if;

  if to_regclass('public.memberships') is not null then
    execute 'select m.organization_id from public.memberships m where m.user_id = $1 limit 1'
      into v_org
      using v_uid;
    if v_org is not null then
      return v_org;
    end if;
  end if;

  if to_regclass('public.profiles') is not null then
    begin
      execute 'select p.organization_id from public.profiles p where p.user_id = $1 limit 1'
        into v_org
        using v_uid;
      if v_org is not null then
        return v_org;
      end if;
    exception when undefined_column then
      null;
    end;

    begin
      execute 'select p.agency_id from public.profiles p where p.user_id = $1 limit 1'
        into v_org
        using v_uid;
      if v_org is not null then
        return v_org;
      end if;
    exception when undefined_column then
      null;
    end;
  end if;

  return null;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  code text not null,
  name text not null,
  subject_template text not null,
  html_template text not null,
  text_template text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  template_id uuid references public.email_templates(id) on delete set null,
  related_entity_type text,
  related_entity_id uuid,
  to_email text not null,
  to_name text,
  subject text not null,
  html_content text not null,
  text_content text,
  status text not null default 'queued',
  provider text,
  provider_message_id text,
  error_message text,
  attempts int not null default 0,
  sent_at timestamptz,
  scheduled_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  email_message_id uuid not null references public.email_messages(id) on delete cascade,
  document_id uuid,
  file_name text not null,
  storage_path text not null,
  mime_type text not null default 'application/pdf',
  created_at timestamptz not null default now()
);

create index if not exists idx_email_messages_organization_id on public.email_messages(organization_id);
create index if not exists idx_email_messages_status on public.email_messages(status);
create index if not exists idx_email_messages_scheduled_at on public.email_messages(scheduled_at);
create index if not exists idx_email_messages_related_entity on public.email_messages(related_entity_type, related_entity_id);
create index if not exists idx_email_attachments_email_message_id on public.email_attachments(email_message_id);
create index if not exists idx_email_templates_org_code on public.email_templates(organization_id, code);

create trigger trg_email_templates_updated_at
before update on public.email_templates
for each row execute function public.set_updated_at();

create trigger trg_email_messages_updated_at
before update on public.email_messages
for each row execute function public.set_updated_at();

alter table public.email_templates enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_attachments enable row level security;

-- Templates policies
create policy if not exists "email_templates_select_org"
on public.email_templates
for select
using (organization_id = public.current_organization_id());

create policy if not exists "email_templates_insert_org"
on public.email_templates
for insert
with check (organization_id = public.current_organization_id());

create policy if not exists "email_templates_update_org"
on public.email_templates
for update
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

create policy if not exists "email_templates_delete_org"
on public.email_templates
for delete
using (organization_id = public.current_organization_id());

-- Messages policies
create policy if not exists "email_messages_select_org"
on public.email_messages
for select
using (organization_id = public.current_organization_id());

create policy if not exists "email_messages_insert_org"
on public.email_messages
for insert
with check (organization_id = public.current_organization_id());

create policy if not exists "email_messages_update_org"
on public.email_messages
for update
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

create policy if not exists "email_messages_delete_org"
on public.email_messages
for delete
using (organization_id = public.current_organization_id());

-- Attachments policies (via parent message)
create policy if not exists "email_attachments_select_org"
on public.email_attachments
for select
using (
  exists (
    select 1
    from public.email_messages em
    where em.id = email_attachments.email_message_id
      and em.organization_id = public.current_organization_id()
  )
);

create policy if not exists "email_attachments_insert_org"
on public.email_attachments
for insert
with check (
  exists (
    select 1
    from public.email_messages em
    where em.id = email_attachments.email_message_id
      and em.organization_id = public.current_organization_id()
  )
);

create policy if not exists "email_attachments_delete_org"
on public.email_attachments
for delete
using (
  exists (
    select 1
    from public.email_messages em
    where em.id = email_attachments.email_message_id
      and em.organization_id = public.current_organization_id()
  )
);

-- Seed example template (will seed for authenticated user's org if available).
insert into public.email_templates (
  organization_id,
  code,
  name,
  subject_template,
  html_template,
  text_template,
  is_active
)
select
  public.current_organization_id(),
  'document_send',
  'Wysłanie dokumentu',
  'Przesyłamy dokument {{document_title}}',
  '<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5"><p>Dzień dobry {{client_name}},</p><p>W załączeniu przesyłamy dokument: <strong>{{document_title}}</strong>.</p><p>W razie pytań proszę o kontakt z agentem: {{agent_name}} ({{agent_email}}).</p><p>Pozdrawiamy,<br/>MWPanel</p></body></html>',
  'Dzień dobry {{client_name}},\n\nW załączeniu przesyłamy dokument: {{document_title}}.\n\nKontakt: {{agent_name}} ({{agent_email}}).',
  true
where public.current_organization_id() is not null
on conflict (organization_id, code) do update set
  name = excluded.name,
  subject_template = excluded.subject_template,
  html_template = excluded.html_template,
  text_template = excluded.text_template,
  is_active = excluded.is_active,
  updated_at = now();