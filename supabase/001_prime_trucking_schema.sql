-- Prime Trucking USA Employee Portal - V1 secure data foundation
create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('admin', 'dispatcher', 'driver');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role public.app_role not null default 'driver',
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_app_role() = 'admin', false) $$;

create table if not exists public.driver_dispatcher_assignments (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  dispatcher_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(driver_id, dispatcher_id)
);

create or replace function public.is_assigned_dispatcher(driver uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.driver_dispatcher_assignments
    where driver_id = driver and dispatcher_id = auth.uid() and active = true
  )
$$;

create table if not exists public.loads (
  id uuid primary key default gen_random_uuid(),
  load_number text not null unique,
  driver_id uuid references public.profiles(id) on delete set null,
  dispatcher_id uuid references public.profiles(id) on delete set null,
  rate_cents integer not null check (rate_cents >= 0),
  pickup_name text, pickup_address text, pickup_at timestamptz,
  delivery_name text, delivery_address text, delivery_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned','in_transit','delivered','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists loads_set_updated_at on public.loads;
create trigger loads_set_updated_at before update on public.loads for each row execute function public.set_updated_at();

create table if not exists public.rate_confirmations (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  acknowledged_at timestamptz,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  load_id uuid references public.loads(id) on delete set null,
  receipt_type text not null check (receipt_type in ('fuel','toll','repair','other')),
  amount_cents integer not null check (amount_cents >= 0),
  receipt_date date not null default current_date,
  storage_path text not null,
  notes text,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists receipts_set_updated_at on public.receipts;
create trigger receipts_set_updated_at before update on public.receipts for each row execute function public.set_updated_at();

create table if not exists public.inspection_reports (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  load_id uuid references public.loads(id) on delete set null,
  inspection_type text not null default 'pre_trip' check (inspection_type in ('pre_trip','post_trip','other')),
  checklist jsonb not null default '{}'::jsonb,
  comments text,
  fault_reported boolean not null default false,
  photo_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  title text,
  is_group boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.chat_members (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(thread_id, profile_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.tracking_settings (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.location_events (
  id bigint generated always as identity primary key,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  recorded_at timestamptz not null default now()
);
create index if not exists location_events_driver_recorded_idx on public.location_events(driver_id, recorded_at desc);

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
from weeks w left join rate_totals r using (driver_id,week_start) left join fuel_totals f using (driver_id,week_start);

alter table public.profiles enable row level security;
alter table public.driver_dispatcher_assignments enable row level security;
alter table public.loads enable row level security;
alter table public.rate_confirmations enable row level security;
alter table public.receipts enable row level security;
alter table public.inspection_reports enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
alter table public.tracking_settings enable row level security;
alter table public.location_events enable row level security;

create policy "profiles read scoped" on public.profiles for select using (id = auth.uid() or public.is_admin() or public.is_assigned_dispatcher(id));
create policy "profiles update self or admin" on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "assignments admin only" on public.driver_dispatcher_assignments for all using (public.is_admin()) with check (public.is_admin());
create policy "loads scoped read" on public.loads for select using (public.is_admin() or driver_id = auth.uid() or dispatcher_id = auth.uid());
create policy "loads dispatcher or admin write" on public.loads for all using (public.is_admin() or dispatcher_id = auth.uid()) with check (public.is_admin() or dispatcher_id = auth.uid());
create policy "rate confirmations scoped read" on public.rate_confirmations for select using (public.is_admin() or exists(select 1 from public.loads l where l.id=load_id and (l.driver_id=auth.uid() or l.dispatcher_id=auth.uid())));
create policy "rate confirmations dispatcher or admin write" on public.rate_confirmations for all using (public.is_admin() or uploaded_by=auth.uid() and public.current_app_role()='dispatcher') with check (public.is_admin() or uploaded_by=auth.uid() and public.current_app_role()='dispatcher');
create policy "receipts scoped read" on public.receipts for select using (public.is_admin() or driver_id=auth.uid() or public.is_assigned_dispatcher(driver_id));
create policy "drivers upload own receipts" on public.receipts for insert with check (driver_id=auth.uid() and public.current_app_role()='driver');
create policy "receipt review by dispatcher admin" on public.receipts for update using (public.is_admin() or public.is_assigned_dispatcher(driver_id)) with check (public.is_admin() or public.is_assigned_dispatcher(driver_id));
create policy "inspections scoped read" on public.inspection_reports for select using (public.is_admin() or driver_id=auth.uid() or public.is_assigned_dispatcher(driver_id));
create policy "drivers submit inspections" on public.inspection_reports for insert with check (driver_id=auth.uid() and public.current_app_role()='driver');
create policy "threads member or admin" on public.chat_threads for select using (public.is_admin() or exists(select 1 from public.chat_members m where m.thread_id=id and m.profile_id=auth.uid()));
create policy "admins create threads" on public.chat_threads for insert with check (public.is_admin());
create policy "members read scoped" on public.chat_members for select using (public.is_admin() or profile_id=auth.uid());
create policy "admins manage members" on public.chat_members for all using (public.is_admin()) with check (public.is_admin());
create policy "messages member or admin read" on public.messages for select using (public.is_admin() or exists(select 1 from public.chat_members m where m.thread_id=messages.thread_id and m.profile_id=auth.uid()));
create policy "members send messages" on public.messages for insert with check (sender_id=auth.uid() and exists(select 1 from public.chat_members m where m.thread_id=messages.thread_id and m.profile_id=auth.uid()));
create policy "tracking scoped read" on public.tracking_settings for select using (public.is_admin() or driver_id=auth.uid() or public.is_assigned_dispatcher(driver_id));
create policy "admins manage tracking" on public.tracking_settings for all using (public.is_admin()) with check (public.is_admin());
create policy "locations scoped read" on public.location_events for select using (public.is_admin() or driver_id=auth.uid() or public.is_assigned_dispatcher(driver_id));
create policy "drivers write own locations" on public.location_events for insert with check (driver_id=auth.uid() and public.current_app_role()='driver');

alter publication supabase_realtime add table public.messages, public.location_events;
