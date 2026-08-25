# Prime Trucking USA employee app

This is the first cross-platform Expo/React Native build for the employee portal.

## Included in the local demo

- Role-specific demo sign-in for Driver, Dispatcher, and Admin.
- Role-based dashboards and limited messaging rules.
- Load/rate-confirmation view using the supplied demo rate of $2,900.00.
- Fuel receipt workflow using the supplied demo receipt value of $84.02.
- Weekly pay calculation: rate confirmations minus fuel, then a driver percentage estimate.
- Friday payment date and the Monday-Sunday work-week rule.
- Pre-trip checks/fault-report interaction.
- Receipt-library picker and inspection-camera capture in the native preview.
- Current-location refresh, tracking indicator, and administrator tracking toggle.

## Running it

Install a current Node.js LTS version, then in this folder run:

```powershell
npm install
npx expo start
```

Open the Expo Go app on an Android device to test the app. iPhone TestFlight distribution will be set up after the Apple Developer Program enrollment is complete.

## Connected backend

The Supabase project has been connected to the FlutterFlow project and now contains the protected application schema, private document buckets, role rules, live-update channels, and the three test roles:

- Admin: `admin.test@primetruckingusa.com`
- Dispatcher: `dispatch.test@primetruckingusa.com`
- Driver: `driver.test@primetruckingusa.com`

The SQL migrations are in `supabase/`. They are the source of truth for the production data model. Do not place a Supabase service-role key or any employee password in this repository.

The Expo app now includes a secure Supabase client, secure mobile session storage, password sign-in, load/receipt service functions, and a Supabase Realtime subscription helper for messages. Add the public project URL and anon key through local `.env` or EAS build secrets; `.env.example` shows the required variable names. The user-facing app must never contain a service-role key.

## Production integrations still required

The local Expo screen is an interactive product preview. The connected Supabase backend supplies the identity, database, storage, row-level access rules, and realtime foundation. Before employee use, finish the FlutterFlow screens/actions and connect:

- a managed calling provider for voice/video;
- a production maps provider and driver consent/on-duty workflow;
- push notification credentials;
- an approved SMTP email provider for employee invitations and password recovery;
- App Store and Google Play developer accounts for store distribution.

The app configuration already declares camera/photo and background-location permissions for the native builds. The current preview reads a location only when the driver taps refresh; background location delivery must be enabled only after the on-duty workflow, consent notice, and server-side audit action are finished. Administrators can pause tracking; that action should always be audited.

See `PRODUCTION_SETUP.md` for the exact Stream Video, Google Maps, Expo/FCM/APNs, and Resend setup sequence.
