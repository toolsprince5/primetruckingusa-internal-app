-- Append-only audit trail for the two actions the product docs call out as
-- requiring one: admin tracking on/off changes, and receipt approve/reject.
-- Implemented as triggers (not client-side calls) so every change is caught
-- regardless of which code path made it, and so no client - not even an
-- authenticated admin - can edit or delete a record after the fact.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_target_idx on public.audit_log (target_type, target_id);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

alter table public.audit_log enable row level security;

-- Admins can review the log. Nobody can insert, update, or delete through
-- the API - only the security-definer trigger functions below can write,
-- since they execute with the privileges of the function owner.
create policy "admins read audit log" on public.audit_log for select using (public.is_admin());
revoke insert, update, delete on public.audit_log from anon, authenticated;

create or replace function public.log_tracking_toggle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') or (old.enabled is distinct from new.enabled) then
    insert into public.audit_log (actor_id, action, target_type, target_id, before, after)
    values (
      coalesce(new.updated_by, auth.uid()),
      'tracking_toggle',
      'driver',
      new.driver_id::text,
      case when tg_op = 'UPDATE' then jsonb_build_object('enabled', old.enabled) else null end,
      jsonb_build_object('enabled', new.enabled)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists tracking_settings_audit on public.tracking_settings;
create trigger tracking_settings_audit
after insert or update on public.tracking_settings
for each row execute function public.log_tracking_toggle();

create or replace function public.log_receipt_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.review_status is distinct from new.review_status then
    insert into public.audit_log (actor_id, action, target_type, target_id, before, after)
    values (
      coalesce(new.reviewed_by, auth.uid()),
      'receipt_review',
      'receipt',
      new.id::text,
      jsonb_build_object('review_status', old.review_status),
      jsonb_build_object('review_status', new.review_status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists receipts_review_audit on public.receipts;
create trigger receipts_review_audit
after update on public.receipts
for each row execute function public.log_receipt_review();
