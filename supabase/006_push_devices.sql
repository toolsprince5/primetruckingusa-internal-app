create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  platform text not null,
  updated_at timestamptz not null default now(),
  unique(profile_id, expo_push_token)
);

alter table public.push_devices enable row level security;

create policy "employees manage own devices" on public.push_devices
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "admins read all devices" on public.push_devices
  for select using (public.is_admin());
