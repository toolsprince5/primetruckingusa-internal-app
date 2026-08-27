import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { saveLocationTelemetry } from './prime-api';
import { supabase } from './supabase';

export const DRIVER_LOCATION_TASK = 'prime-trucking-driver-location';

export type TrackingState =
  | 'idle'
  | 'starting'
  | 'active'
  | 'foreground_only'
  | 'permission_denied'
  | 'gps_unavailable'
  | 'offline';

const options: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced,
  distanceInterval: 100,
  timeInterval: 60_000,
  pausesUpdatesAutomatically: true,
  foregroundService: {
    notificationTitle: 'Prime Trucking USA tracking is active',
    notificationBody: 'Your dispatcher can see your location while you are on duty.',
    notificationColor: '#B51F2A',
  },
};

let activeWatch: Location.LocationSubscription | null = null;

async function persist(location: Location.LocationObject) {
  const auth = supabase;
  if (!auth) return;
  const { data } = await auth.auth.getUser();
  if (!data.user) return;
  await saveLocationTelemetry({
    driverId: data.user.id,
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    heading: location.coords.heading,
    speed: location.coords.speed,
    recordedAt: new Date(location.timestamp).toISOString(),
  });
}

// The task is registered at module scope so Android can deliver background
// locations after an app restart. It writes through the same RLS-protected
// Supabase API as foreground tracking.
TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
  for (const location of locations) {
    try { await persist(location); } catch { /* The next delivery retries after connectivity returns. */ }
  }
});

export async function startDriverTracking(onLocation: (location: Location.LocationObject) => void): Promise<TrackingState> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) return 'permission_denied';

  const services = await Location.hasServicesEnabledAsync();
  if (!services) return 'gps_unavailable';

  const background = await Location.requestBackgroundPermissionsAsync();
  const hasBackground = background.granted;

  const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  onLocation(current);
  await persist(current);

  activeWatch?.remove();
  activeWatch = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, distanceInterval: 100, timeInterval: 60_000 },
    (location) => {
      onLocation(location);
      void persist(location);
    },
  );

  if (hasBackground && !(await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK))) {
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, options);
  }
  return hasBackground ? 'active' : 'foreground_only';
}

export async function stopDriverTracking() {
  activeWatch?.remove();
  activeWatch = null;
  if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  }
}
