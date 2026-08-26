-- WhatsApp-style group threads. Group creation stays admin-only (see the
-- existing "admins create threads" policy on chat_threads - unchanged).
-- This migration only widens who may add or remove participants: a
-- dispatcher may manage membership of a group they already belong to,
-- in addition to admins who can manage any group. A dispatcher who is
-- not yet a member of a given group cannot add themselves or anyone
-- else to it - only an existing member (added by an admin, or by another
-- member dispatcher) can extend that group further.

create policy "dispatchers manage own group members" on public.chat_members
  for all
  using (
    public.current_app_role() = 'dispatcher'
    and exists (select 1 from public.chat_threads t where t.id = chat_members.thread_id and t.is_group = true)
    and exists (select 1 from public.chat_members m where m.thread_id = chat_members.thread_id and m.profile_id = auth.uid())
  )
  with check (
    public.current_app_role() = 'dispatcher'
    and exists (select 1 from public.chat_threads t where t.id = chat_members.thread_id and t.is_group = true)
    and exists (select 1 from public.chat_members m where m.thread_id = chat_members.thread_id and m.profile_id = auth.uid())
  );

-- The base "members read scoped" policy on chat_members (see 001) only lets a
-- caller see their OWN membership row, by design - it exists so a client can
-- check "am I in this thread", not to list co-members. Group management needs
-- the full roster, so this security-definer function returns every member of
-- one thread, but only to a caller who is themselves a member of it (or an
-- admin) - mirroring how list_allowed_chat_partners already scopes visibility
-- without loosening the base table policies.
create or replace function public.list_thread_members(thread_id uuid)
returns table (id uuid, full_name text, email text, role public.app_role, joined_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.email, p.role, m.joined_at
  from public.chat_members m
  join public.profiles p on p.id = m.profile_id
  where m.thread_id = list_thread_members.thread_id
    and (
      public.is_admin()
      or exists (
        select 1 from public.chat_members caller
        where caller.thread_id = list_thread_members.thread_id and caller.profile_id = auth.uid()
      )
    )
  order by p.full_name;
$$;

grant execute on function public.list_thread_members(uuid) to authenticated;
