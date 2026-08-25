-- Align the directly created test account with the app's Driver role.
-- Run after the Driver account has been created in Supabase Authentication.
update public.profiles
set
  full_name = 'Driver',
  role = 'driver'
where email = 'driver.test@primetruckingusa.com';
