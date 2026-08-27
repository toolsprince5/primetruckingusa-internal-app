import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Android maps key is injected without committing a secret', async () => {
  const [gradle, manifest] = await Promise.all([
    read('android/app/build.gradle'),
    read('android/app/src/main/AndroidManifest.xml'),
  ]);
  assert.match(gradle, /EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY/);
  assert.match(manifest, /com\.google\.android\.geo\.API_KEY/);
  assert.match(manifest, /\$\{googleMapsApiKey\}/);
});

test('tracking is permissioned, background-capable, realtime, and server gated', async () => {
  const [tracking, app, migration] = await Promise.all([
    read('src/lib/tracking.ts'),
    read('App.tsx'),
    read('supabase/015_tracking_realtime_and_dispatcher_control.sql'),
  ]);
  assert.match(tracking, /requestForegroundPermissionsAsync/);
  assert.match(tracking, /startLocationUpdatesAsync/);
  assert.match(app, /subscribeToFleetLocations/);
  assert.match(app, /trackingAllowed \|\| !onDuty/);
  assert.match(migration, /tracking_toggle/);
  assert.match(migration, /supabase_realtime/);
});

test('safe areas and Stream calling remain connected at the app shell', async () => {
  const app = await read('App.tsx');
  const tokenFunction = await read('supabase/functions/stream-video-token/index.ts');
  assert.match(app, /SafeAreaProvider/);
  assert.match(app, /paddingBottom: Math\.max\(insets\.bottom/);
  assert.match(app, /RingingCallContent/);
  assert.match(tokenFunction, /profile\?\.active/);
});
