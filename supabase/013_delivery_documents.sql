-- Proof of Delivery (POD) and Bill of Lading (BOL) photos, uploaded by the
-- assigned driver once a load is delivered. Same private-storage pattern as
-- receipts and inspection photos: a scoped bucket plus a row per upload so
-- every document is timestamped and attributable to the driver who sent it.

create table if not exists public.delivery_documents (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null check (document_type in ('pod', 'bol')),
  storage_path text not null,
  original_filename text,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists delivery_documents_load_idx on public.delivery_documents(load_id, created_at desc);
create index if not exists delivery_documents_driver_idx on public.delivery_documents(driver_id, created_at desc);

alter table public.delivery_documents enable row level security;

-- Same visibility as the load itself: admin, the assigned driver, the
-- assigned dispatcher relationship, or the load's own dispatcher.
create policy "delivery documents scoped read" on public.delivery_documents
  for select using (
    public.is_admin()
    or driver_id = auth.uid()
    or public.is_assigned_dispatcher(driver_id)
    or exists (select 1 from public.loads l where l.id = load_id and l.dispatcher_id = auth.uid())
  );

-- Only the assigned driver may upload POD/BOL for their own load.
create policy "drivers upload own delivery documents" on public.delivery_documents
  for insert
  with check (
    driver_id = auth.uid()
    and public.current_app_role() = 'driver'
    and exists (select 1 from public.loads l where l.id = load_id and l.driver_id = auth.uid())
  );

insert into storage.buckets (id, name, public)
values ('delivery-documents', 'delivery-documents', false)
on conflict (id) do nothing;

create policy "delivery document upload scoped" on storage.objects for insert
with check (bucket_id = 'delivery-documents' and (public.is_admin() or public.current_app_role() = 'driver'));

create policy "delivery document download scoped" on storage.objects for select
using (
  bucket_id = 'delivery-documents' and (
    public.is_admin() or name like auth.uid()::text || '/%' or exists (
      select 1 from public.delivery_documents d
      where d.storage_path = name and (
        public.is_assigned_dispatcher(d.driver_id)
        or exists (select 1 from public.loads l where l.id = d.load_id and l.dispatcher_id = auth.uid())
      )
    )
  )
);
