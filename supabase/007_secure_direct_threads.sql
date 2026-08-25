-- Securely create or reuse a direct operational conversation.
-- Drivers may only start conversations with an assigned dispatcher or an admin.
create or replace function public.get_or_create_direct_thread(peer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_role public.app_role;
  peer_role public.app_role;
  existing_id uuid;
  new_id uuid;
begin
  if me is null or peer_id is null or me = peer_id then
    raise exception 'A different authenticated participant is required';
  end if;

  select role into my_role from public.profiles where id = me and active = true;
  select role into peer_role from public.profiles where id = peer_id and active = true;
  if my_role is null or peer_role is null then
    raise exception 'Conversation participant is unavailable';
  end if;

  if my_role = 'driver' and not (
    peer_role = 'admin' or
    (peer_role = 'dispatcher' and exists (
      select 1 from public.driver_dispatcher_assignments
      where driver_id = me and dispatcher_id = peer_id and active = true
    ))
  ) then
    raise exception 'Drivers may only message their assigned dispatcher or an admin';
  end if;

  if my_role = 'dispatcher' and not (
    peer_role = 'admin' or
    (peer_role = 'driver' and exists (
      select 1 from public.driver_dispatcher_assignments
      where driver_id = peer_id and dispatcher_id = me and active = true
    ))
  ) then
    raise exception 'Dispatchers may only message assigned drivers or an admin';
  end if;

  select t.id into existing_id
  from public.chat_threads t
  where t.is_group = false
    and exists (select 1 from public.chat_members m where m.thread_id = t.id and m.profile_id = me)
    and exists (select 1 from public.chat_members m where m.thread_id = t.id and m.profile_id = peer_id)
    and (select count(*) from public.chat_members m where m.thread_id = t.id) = 2
  limit 1;
  if existing_id is not null then return existing_id; end if;

  insert into public.chat_threads (created_by, is_group)
  values (me, false)
  returning id into new_id;
  insert into public.chat_members (thread_id, profile_id)
  values (new_id, me), (new_id, peer_id);
  return new_id;
end;
$$;

grant execute on function public.get_or_create_direct_thread(uuid) to authenticated;
