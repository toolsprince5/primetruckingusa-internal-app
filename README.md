# Prime Trucking USA employee app

This is the first cross-platform Expo/React Native build for the employee portal.

## Included in the app

- Invite-only Driver and Dispatcher account setup. Each link is single-use, expires after eight hours, and carries the role defined by the administrator.
- Role-based dashboards and limited messaging rules.
- Load/rate-confirmation view using the supplied demo rate of $2,900.00.
- Fuel receipt workflow using the supplied demo receipt value of $84.02.
- Weekly pay calculation: rate confirmations minus fuel, then a driver percentage estimate.
- Friday payment date and the Monday-Sunday work-week rule.
- Pre-trip checks/fault-report interaction.
- Receipt-library picker and inspection-camera capture in the native preview.
- Current-location refresh, tracking indicator, and administrator tracking toggle.
- Driver upload of Proof of Delivery (POD) and Bill of Lading (BOL) photos per load.
- Dispatcher rate-confirmation updates: re-sending a rate confirmation for a load adds a new, separately time-stamped version instead of losing the previous one - for when a broker resends the same load/document number with revised terms.
- Admin "Employee activity" view (Admin Controls → Employee activity): open any driver's or dispatcher's profile and see everything they've uploaded - receipts, pre-trip comments and photos, POD/BOL, or rate confirmations sent - each entry time-stamped.
- WhatsApp-style group messaging: Admins create groups; Admins and Dispatchers who already belong to a group can add or remove its participants.

## Running it

Install a current Node.js LTS version, then in this folder run:

```powershell
npm install
npx expo start
```

Open the Expo Go app on an Android device to test the app. iPhone TestFlight distribution will be set up after the Apple Developer Program enrollment is complete.

## Connected backend

The Supabase project has the protected application schema, private document buckets, role rules, live-update channels, and the three test profiles:

- Admin: `admin.test@primetruckingusa.com`
- Dispatcher: `dispatch.test@primetruckingusa.com`
- Driver: `driver.test@primetruckingusa.com`

The SQL migrations are in `supabase/`. They are the source of truth for the production data model. Do not place a Supabase service-role key or any employee password in this repository.

The Expo app now includes a secure Supabase client, secure mobile session storage, password sign-in, load/receipt service functions, and a Supabase Realtime subscription helper for messages. Add the public project URL and anon key through local `.env` or EAS build secrets; `.env.example` shows the required variable names. The user-facing app must never contain a service-role key.

## Required before inviting employees

1. Apply `supabase/009_invite_only_identity_and_data_boundaries.sql` through `supabase/014_group_chat_management.sql`, in order, in Supabase SQL Editor.
   - 010 makes an admin's "tracking off" a real database rule instead of a client-side setting.
   - 011 adds an append-only audit trail for tracking changes and receipt reviews, queryable by admins directly in Supabase.
   - 012 splits tracking into an admin-owned override and a driver-owned on-duty status, so a driver's own "on duty" switch has a real column to write to without being able to touch the admin's override.
   - 013 adds the `delivery_documents` table and private `delivery-documents` storage bucket for driver-uploaded POD/BOL photos.
   - 014 lets a dispatcher who already belongs to a group manage its participants (add/remove), alongside admins, and adds the `list_thread_members` function group chat needs to show who's in a thread.
2. Deploy `create-employee-invite` and `claim-employee-invite` Edge Functions.
3. Set `RESEND_API_KEY` and `INVITE_FROM_EMAIL` as Edge Function secrets. Without those two settings, an Admin can still securely share the generated invite link from the app.
4. In Supabase **Authentication → Providers → Email**, disable public sign-ups. Admin accounts remain owner-controlled; Drivers and Dispatchers are created only by the one-time invite function.
5. Set up password-reset delivery per `WEB_PASSWORD_RESET_SETUP.md` - deploy the `web/reset-password/` page and add its HTTPS URL as an allowed redirect URL in Supabase Authentication settings. Without this, Supabase will not deliver the reset email to that link.
6. Build a new Android/iOS app after applying the configuration above.

## Self-service password reset

Employees can reset their own password from the sign-in screen ("Forgot password?") without an administrator. It uses Supabase Auth's built-in `resetPasswordForEmail`, which emails a one-time link to `https://primetruckingusa.com/reset-password/` (see `WEB_PASSWORD_RESET_SETUP.md`); that page works in any browser and offers an "Open in app" action that hands off to the same in-app recovery screen for anyone with the app installed. Supabase intentionally returns the same response whether or not the address has an account, so the app never confirms or denies which work emails exist. Delivery depends on the SMTP/email provider configured in Supabase Auth — see "Production integrations still required" below.

## Admin oversight and group messaging

- **Employee activity** (Admin Controls → Employee activity): an admin picks any active driver or dispatcher and sees what they've sent - a driver's fuel receipts, pre-trip inspection comments/photos, and POD/BOL uploads, or a dispatcher's sent rate confirmations - every entry with the time it was submitted. This reads existing per-employee data through the same row-level security every other screen already uses (an admin already sees all rows; the queries just add a `driver_id`/`uploaded_by` filter), so it needed no new access rules, only new read functions.
- **Rate confirmation updates**: dispatchers/admins can re-send a rate confirmation for a load that already has one; the new file becomes the current version and the previous version(s) stay on record with their own time stamp, so a broker resending the same load under revised terms doesn't erase what was there before.
- **Proof of Delivery / Bill of Lading**: the assigned driver can upload clear photos of the POD and BOL for their load from the Loads screen; each upload is private, time-stamped, and visible to the admin and the load's dispatcher.
- **Group messaging**: from Messages, an Admin can start a group (name + participants) with "+ New group". Group creation is admin-only at the database layer. Once created, an Admin or a Dispatcher who already belongs to that group can open "Manage participants" to add or remove people; a dispatcher who isn't yet a member of a group cannot add themselves or anyone else to it.

## Production integrations still required

The local Expo screen is an interactive product preview. The connected Supabase backend supplies the identity, database, storage, row-level access rules, and realtime foundation. Before employee use, finish the FlutterFlow screens/actions and connect:

- a managed calling provider for voice/video;
- a production maps provider and driver consent/on-duty workflow;
- push notification credentials;
- an approved SMTP email provider for employee invitations and password recovery;
- App Store and Google Play developer accounts for store distribution.

The app configuration declares camera/photo and foreground-location permissions for the native builds. It deliberately does **not** declare background-location permissions (`UIBackgroundModes: location` on iOS, `ACCESS_BACKGROUND_LOCATION` on Android) yet, because the app doesn't use background location — the current build reads a location only when the driver taps refresh while on duty. Add those permissions back only once background delivery, an explicit consent notice, and the server-side audit action are all built and shipping together; declaring the capability earlier than that needlessly triggers the stronger OS permission prompts and risks App/Play Store rejection for an unused capability. The on-duty status and admin tracking override are already real, database-enforced, and audited (see `supabase/010_enforce_tracking_toggle.sql` through `012_driver_duty_status.sql`) — background delivery is the remaining piece.

See `PRODUCTION_SETUP.md` for the exact Stream Video, Google Maps, Expo/FCM/APNs, and Resend setup sequence.
