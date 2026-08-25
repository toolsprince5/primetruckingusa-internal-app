-- Make the tracking on/off switch a real server-side boundary instead of a
-- client-side suggestion. Previously a driver's app (or any modified client
-- holding a valid driver session) could keep inserting location_events even
-- after an admin turned tracking off for that driver, because the insert
-- policy only checked that the row belonged to the authenticated driver.
-- A driver with no tracking_settings row yet defaults to enabled, matching
-- the client's own default in getTrackingSettings().

drop policy if exists "drivers write own locations" on public.location_events;

create policy "drivers write own locations" on public.location_events
  for insert
  with check (
    driver_id = auth.uid()
    and public.current_app_role() = 'driver'
    and coalesce(
      (select enabled from public.tracking_settings where driver_id = auth.uid()),
      true
    )
  );
