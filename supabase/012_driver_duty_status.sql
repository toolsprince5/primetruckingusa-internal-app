-- Reconciles the app's two separate "is this driver being tracked" ideas
-- (the Home screen's on-duty switch and the Tracking screen's admin toggle)
-- into one real model with two clearly owned fields on tracking_settings:
--
--   enabled  - the administrator's override. Only an admin may change this.
--              Turning it off always wins, regardless of duty status.
--   on_duty  - the driver's own choice to start/stop their workday. A driver
--              may only ever change this field, and only on their own row.
--
-- Effective location sharing is "enabled AND on_duty" - enforced below both
-- as a write boundary (a driver's write can never touch `enabled`) and as
-- the actual gate on inserting location_events.

alter table public.tracking_settings add column if not exists on_duty boolean not null default true;

-- Previously only "admins manage tracking" (for all) could write this table,
-- so a driver had no legitimate way to persist their own on-duty status.
create policy "drivers insert own duty status" on public.tracking_settings
  for insert
  with check (driver_id = auth.uid() and public.current_app_role() = 'driver');

create policy "drivers update own duty status" on public.tracking_settings
  for update
  using (driver_id = auth.uid() and public.current_app_role() = 'driver')
  with check (driver_id = auth.uid() and public.current_app_role() = 'driver');

-- RLS is row-level, not column-level, so a trigger enforces the column
-- boundary: a driver's insert/update may never set or change `enabled`.
create or replace function public.enforce_tracking_settings_boundaries()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if tg_op = 'UPDATE' and (new.enabled is distinct from old.enabled) then
      raise exception 'Only an administrator can change the tracking override';
    end if;
    if tg_op = 'INSERT' and new.enabled is distinct from true then
      raise exception 'Only an administrator can change the tracking override';
    end if;
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists tracking_settings_boundaries on public.tracking_settings;
create trigger tracking_settings_boundaries
before insert or update on public.tracking_settings
for each row execute function public.enforce_tracking_settings_boundaries();

-- Refine the audit trigger from 011: only the admin-controlled `enabled`
-- override belongs in the audit log, not a driver's routine duty changes.
create or replace function public.log_tracking_toggle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() and ((tg_op = 'INSERT') or (old.enabled is distinct from new.enabled)) then
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

-- Effective sharing now requires both the admin override and the driver's
-- own duty status, not just the override (supersedes 010's version of this
-- policy, which only checked `enabled`).
drop policy if exists "drivers write own locations" on public.location_events;
create policy "drivers write own locations" on public.location_events
  for insert
  with check (
    driver_id = auth.uid()
    and public.current_app_role() = 'driver'
    and coalesce((select enabled from public.tracking_settings where driver_id = auth.uid()), true)
    and coalesce((select on_duty from public.tracking_settings where driver_id = auth.uid()), true)
  );
