# Runtime setup checklist

No private keys belong in this repository. Configure these values in the Expo/EAS environment used for the app.

## Maps

- `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`: an Android-restricted Google Maps SDK key for `com.primetruckingusa.portal`.
- `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY`: an iOS-restricted Google Maps SDK key for the app bundle identifier.
- Enable **Maps SDK for Android** and **Maps SDK for iOS** in the same Google Cloud project.

The committed Android project reads its key through a manifest placeholder, so the key is injected at build time and is not committed.

## Stream calling

- `EXPO_PUBLIC_STREAM_API_KEY`: Stream public API key.
- `EXPO_PUBLIC_STREAM_FCM_PROVIDER_NAME`: Stream dashboard alias for the Android FCM provider.
- `EXPO_PUBLIC_STREAM_APN_PROVIDER_NAME`: Stream dashboard alias for the Apple APNs provider.
- Supabase Edge Function secret `STREAM_API_KEY`.
- Supabase Edge Function secret `STREAM_API_SECRET`.

Deploy `supabase/functions/stream-video-token` and verify that signed-in users can invoke it. Android requires microphone permission for audio calls and both microphone and camera permission for video calls.

## Employee invitations

- Supabase Edge Function secret `RESEND_API_KEY`.
- Supabase Edge Function secret `INVITE_FROM_EMAIL`, using a sender address verified in Resend.

The Supabase-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` variables are also used by the invitation functions.

## Tracking

Apply migrations through `015_tracking_realtime_and_dispatcher_control.sql`. Drivers transmit location only while both the staff override and the driver's on-duty switch are enabled. An administrator or the driver's assigned dispatcher can change the override; changes are audited. Android background tracking shows a persistent notification.

## Release verification

Run type checking and tests before requesting a preview build. A build should only be started after all environment values above are available to the chosen Expo/EAS environment.
