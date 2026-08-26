# Production provider setup

The client code is prepared for these selected providers. Secrets must be added only to the provider dashboards, EAS build secrets, or Supabase Edge Function secrets—not committed to source code.

## 1. Stream Video

1. Create a Stream Video app and obtain its public API key plus private API secret.
2. Add `EXPO_PUBLIC_STREAM_API_KEY` to the Expo/EAS build environment.
3. Set `STREAM_API_KEY` and `STREAM_API_SECRET` as Supabase Edge Function secrets.
4. Deploy `supabase/functions/stream-video-token`.
5. In Stream, configure calls so drivers can call only their assigned dispatcher or an admin. Enforce this in Stream’s server-side permission rules; do not rely only on hiding UI controls.
6. Connect FCM and APNs credentials in Stream for incoming call alerts.
7. Create the Stream push-provider aliases and set their public names in the Expo/EAS environment as `EXPO_PUBLIC_STREAM_FCM_PROVIDER_NAME` and (when iPhone support is enabled) `EXPO_PUBLIC_STREAM_APN_PROVIDER_NAME`.

## 2. Google Maps

1. Create a Google Cloud project, enable Maps SDK for Android and iOS, and attach billing.
2. Create separate restricted API keys: Android key restricted to `com.primetruckingusa.portal`; iOS key restricted to `com.primetruckingusa.portal`.
3. Add the keys to the native Expo configuration before a new development/production build.
4. Keep the live-location data in Supabase `location_events`; only send while a driver is on duty and tracking is enabled by an admin.

## 3. Push notifications

1. Create an Expo/EAS project and place its `projectId` in the Expo app configuration.
2. Register the Android app in Firebase Cloud Messaging and upload the FCM service-account key to the Expo credentials workflow.
3. Enroll in the Apple Developer Program, create an APNs key, and upload it to the Expo credentials workflow.
4. Apply `supabase/006_push_devices.sql`; it holds each employee’s device token under row-level access rules.
5. Send operational notifications from a trusted server function, never directly from the phone app.
6. Provide `google-services.json` to EAS Build - see "Android google-services.json" below. It is required for both push notifications and Stream's native calling integration, and is intentionally not committed to this repo.

### Android google-services.json

`google-services.json` holds real Firebase project credentials, so it is gitignored and must never be committed. Because `android/` is committed to this repo (added for Stream Video's native calling integration), Android is a bare/native project as far as EAS Build is concerned: it builds the checked-in native project directly and does not run `expo prebuild`. That means the managed-workflow `googleServicesFile` setting in `app.json`/`app.config.js` - which only takes effect during a prebuild step - is **not** applied for Android builds here, even though it is still correct for how a purely managed build would behave. `android/app/build.gradle` applies the Google Services Gradle plugin unconditionally, so a missing file fails the build immediately with exactly the error this section fixes.

1. In the EAS project dashboard (or `eas env:create`), create a project environment variable named `GOOGLE_SERVICES_JSON` of type **file**, uploading the real `google-services.json` from the Firebase console. Never paste its contents into chat, a commit, or an `.env` file.
2. That's it on the EAS side - [`eas-build-pre-install.sh`](../eas-build-pre-install.sh) already in this repo copies the file EAS resolves that variable to into `android/app/google-services.json` before the native build runs. It's a no-op (with a warning in the build log) if the variable isn't set, so an iOS-only build is unaffected.
3. Confirm it worked by checking the Android build log for "Copying google-services.json into android/app/" near the start of the build.

## 4. Resend for authentication email

1. Create a Resend account and verify an authentication-only sending subdomain such as `auth.primetruckingusa.com` through Namecheap DNS.
2. In Supabase Authentication settings, connect the Resend integration or enter its SMTP settings.
3. Use a From address such as `Prime Trucking USA <no-reply@auth.primetruckingusa.com>`.
4. Confirm SPF, DKIM, and DMARC records before inviting real employees.

## Final safety checks

- Test real camera, microphone, location, push, and call behavior on physical iPhone and Android devices.
- Explain on-duty tracking before permission is granted; make the active state obvious to drivers.
- Confirm that a driver cannot message or call an unassigned driver, and that Admin audit access works.
- Test a password-reset and invitation email before issuing real accounts.
