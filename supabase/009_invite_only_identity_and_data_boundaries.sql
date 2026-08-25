-- Prime Trucking USA: invite-only identity and strict employee data boundaries.
-- Apply this migration in the Supabase SQL Editor before issuing employee invites.

-- A profile is tied to exactly one authenticated employee and email address.
create unique index if not exists profiles_email_lower_unique
  on public.profiles (lower(email));

-- A driver may have one active assigned dispatcher. Historical assignments remain intact.
create unique index if not exists one_active_dispatcher_per_driver
  on public.driver_dispatcher_assignments (driver_id)
  where active = true;

create or replace function public.validate_driver_dispatcher_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = new.driver_id and role = 'driver') then
    raise exception 'driver_id must belong to a driver profile';
  end if;
  if not exists (select 1 from public.profiles where id = new.dispatcher_id and role = 'dispatcher') then
    raise exception 'dispatcher_id must belong to a dispatcher profile';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_driver_dispatcher_assignment on public.driver_dispatcher_assignments;
create trigger validate_driver_dispatcher_assignment
before insert or update on public.driver_dispatcher_assignments
for each row execute function public.validate_driver_dispatcher_assignment();

-- Employees cannot promote themselves or edit any role fields. Admins manage profiles.
drop policy if exists "profiles update self or admin" on public.profiles;
create policy "admins update profiles only" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- Dispatchers may coordinate loads and inspections, but never view a driver's receipts,
-- fuel totals, or individual payment calculations.
drop policy if exists "receipts scoped read" on public.receipts;
drop policy if exists "receipt review by dispatcher admin" on public.receipts;
create policy "receipts private to driver or admin" on public.receipts
  for select using (public.is_admin() or driver_id = auth.uid());
create policy "receipt review by admin only" on public.receipts
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "receipt download scoped" on storage.objects;
create policy "receipt download private to driver or admin" on storage.objects
  for select using (
    bucket_id = 'receipts' and (
      public.is_admin() or name like auth.uid()::text || '/%'
    )
  );

-- The earnings view must never return rows to a dispatcher.
create or replace view public.weekly_driver_earnings with (security_invoker = true) as
with weeks as (
  select distinct driver_id, date_trunc('week', created_at at time zone 'America/New_York')::date as week_start
  from public.loads where driver_id is not null
  union
  select distinct driver_id, date_trunc('week', receipt_date)::date as week_start from public.receipts
), rate_totals as (
  select driver_id, date_trunc('week', created_at at time zone 'America/New_York')::date as week_start,
    sum(rate_cents) filter (where status = 'delivered') as rate_cents
  from public.loads group by 1,2
), fuel_totals as (
  select driver_id, date_trunc('week', receipt_date)::date as week_start,
    sum(amount_cents) filter (where receipt_type = 'fuel' and review_status = 'approved') as fuel_cents
  from public.receipts group by 1,2
)
select w.driver_id, w.week_start, (w.week_start + 11) as payment_date,
  coalesce(r.rate_cents,0) as rate_cents, coalesce(f.fuel_cents,0) as fuel_cents,
  coalesce(r.rate_cents,0) - coalesce(f.fuel_cents,0) as net_cents
from weeks w
left join rate_totals r using (driver_id,week_start)
left join fuel_totals f using (driver_id,week_start)
where public.is_admin() or w.driver_id = auth.uid();

-- Invite records store a hash, never the usable invite token. An invite is single-use
-- and expires eight hours after creation.
create table if not exists public.employee_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  role public.app_role not null check (role in ('driver', 'dispatcher')),
  dispatcher_id uuid references public.profiles(id) on delete restrict,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '8 hours'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((role = 'driver') or dispatcher_id is null),
  check (expires_at <= created_at + interval '8 hours')
);
create unique index if not exists one_open_invite_per_email
  on public.employee_invites (lower(email)) where accepted_at is null;

alter table public.employee_invites enable row level security;
create policy "admins manage employee invites" on public.employee_invites
  for all using (public.is_admin()) with check (public.is_admin());

-- Only the trusted edge functions may use service-role access to claim an invite.
revoke all on public.employee_invites from anon, authenticated;

-- Prevent any non-invite account from becoming an active employee profile.
-- The standard new-user trigger creates a dormant profile; the claim function below
-- is the only path that activates it and assigns its admin-defined role.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    'driver',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
