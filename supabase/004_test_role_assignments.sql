-- Assign approved test roles after the authentication invitations create profiles.
update public.profiles
set full_name = 'Admin', role = 'admin'
where email = 'admin.test@primetruckingusa.com';

update public.profiles
set full_name = 'Dispatcher', role = 'dispatcher'
where email = 'dispatch.test@primetruckingusa.com';
