-- Returns only people the signed-in employee may start a direct operational chat with.
create or replace function public.list_allowed_chat_partners()
returns table (id uuid, full_name text, email text, role public.app_role)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.id, p.role from public.profiles p where p.id = auth.uid() and p.active = true
  )
  select p.id, p.full_name, p.email, p.role
  from public.profiles p, me
  where p.active = true
    and p.id <> me.id
    and (
      me.role = 'admin'
      or p.role = 'admin'
      or (me.role = 'driver' and p.role = 'dispatcher' and exists (
        select 1 from public.driver_dispatcher_assignments a
        where a.driver_id = me.id and a.dispatcher_id = p.id and a.active = true
      ))
      or (me.role = 'dispatcher' and p.role = 'driver' and exists (
        select 1 from public.driver_dispatcher_assignments a
        where a.dispatcher_id = me.id and a.driver_id = p.id and a.active = true
      ))
    )
  order by p.full_name;
$$;

grant execute on function public.list_allowed_chat_partners() to authenticated;
