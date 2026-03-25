-- Hardening for production queue processing

-- Basic integrity constraints
alter table public.email_messages
  add constraint email_messages_status_check
  check (status in ('queued', 'sending', 'sent', 'failed'));

alter table public.email_messages
  add constraint email_messages_related_entity_type_check
  check (
    related_entity_type is null
    or related_entity_type in ('client', 'property', 'transaction', 'document')
  );

create index if not exists idx_email_messages_status_scheduled_at
  on public.email_messages(status, scheduled_at);

-- Claim messages atomically (safe for multiple workers)
create or replace function public.claim_email_messages(p_limit int default 20)
returns setof public.email_messages
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with locked as (
    select em.id
    from public.email_messages em
    where em.status = 'queued'
      and (em.scheduled_at is null or em.scheduled_at <= now())
    order by em.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ), updated as (
    update public.email_messages em
    set
      status = 'sending',
      attempts = em.attempts + 1,
      error_message = null,
      updated_at = now()
    where em.id in (select id from locked)
    returning em.*
  )
  select * from updated;
end;
$$;

revoke all on function public.claim_email_messages(int) from public;
grant execute on function public.claim_email_messages(int) to service_role;
