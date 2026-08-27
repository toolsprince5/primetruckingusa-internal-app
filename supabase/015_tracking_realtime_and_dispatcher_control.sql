-- Allow an assigned dispatcher to manage only their assigned drivers' tracking.
-- The existing boundary trigger still prevents drivers from changing `enabled`.
drop policy if exists "admins manage tracking" on public.tracking_settings;
create policy "authorized staff manage tracking" on public.tracking_settings
  for all
  using (public.is_admin() or public.is_assigned_dispatcher(driver_id))
  with check (public.is_admin() or public.is_assigned_dispatcher(driver_id));

create or replace function public.enforce_tracking_settings_boundaries()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() = 'driver' then
    if tg_op = 'UPDATE' and (new.enabled is distinct from old.enabled) then
      raise exception 'Drivers cannot change the tracking override';
    end if;
    if tg_op = 'INSERT' and new.enabled is distinct from true then
      raise exception 'Drivers cannot change the tracking override';
    end if;
  elsif not public.is_admin() and not public.is_assigned_dispatcher(new.driver_id) then
    raise exception 'Only authorized staff can change this tracking override';
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

create or replace function public.log_tracking_toggle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() in ('admin', 'dispatcher')
     and ((tg_op = 'INSERT') or (old.enabled is distinct from new.enabled)) then
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

-- Supabase Realtime ignores a table until it belongs to this publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tracking_settings'
  ) then
    alter publication supabase_realtime add table public.tracking_settings;
  end if;
end $$;
