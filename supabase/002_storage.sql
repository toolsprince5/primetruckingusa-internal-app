-- Private document storage for Prime Trucking USA Employee Portal
insert into storage.buckets (id, name, public)
values ('rate-confirmations', 'rate-confirmations', false),
       ('receipts', 'receipts', false),
       ('inspection-photos', 'inspection-photos', false)
on conflict (id) do nothing;

create policy "rate confirmations scoped download" on storage.objects for select
using (
  bucket_id = 'rate-confirmations' and (
    public.is_admin() or exists (
      select 1 from public.rate_confirmations rc join public.loads l on l.id = rc.load_id
      where rc.storage_path = name and (l.driver_id = auth.uid() or l.dispatcher_id = auth.uid())
    )
  )
);
create policy "dispatchers upload rate confirmations" on storage.objects for insert
with check (bucket_id = 'rate-confirmations' and (public.is_admin() or public.current_app_role() = 'dispatcher'));

create policy "receipt upload scoped" on storage.objects for insert
with check (bucket_id = 'receipts' and (public.is_admin() or public.current_app_role() = 'driver'));
create policy "receipt download scoped" on storage.objects for select
using (
  bucket_id = 'receipts' and (
    public.is_admin() or name like auth.uid()::text || '/%' or exists (
      select 1 from public.receipts r where r.storage_path = name and public.is_assigned_dispatcher(r.driver_id)
    )
  )
);

create policy "inspection upload scoped" on storage.objects for insert
with check (bucket_id = 'inspection-photos' and (public.is_admin() or public.current_app_role() = 'driver'));
create policy "inspection download scoped" on storage.objects for select
using (
  bucket_id = 'inspection-photos' and (
    public.is_admin() or name like auth.uid()::text || '/%' or exists (
      select 1 from public.inspection_reports i where name = any(i.photo_paths) and public.is_assigned_dispatcher(i.driver_id)
    )
  )
);
