import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Register the physical device after authentication and save only its push token. */
export async function registerPushDevice(profileId: string) {
  if (!Device.isDevice) return null;

  const hasGrantedPermission = (response: unknown) => (response as { status?: string }).status === 'granted';
  const permissions = await Notifications.getPermissionsAsync();
  let granted = hasGrantedPermission(permissions);
  if (!granted) granted = hasGrantedPermission(await Notifications.requestPermissionsAsync());
  if (!granted) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (supabase) {
    const { error } = await supabase.from('push_devices').upsert({
      profile_id: profileId,
      expo_push_token: token,
      platform: Device.osName ?? 'unknown',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'profile_id,expo_push_token' });
    if (error) throw error;
  }
  return token;
}
