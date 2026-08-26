import { StreamVideoClient, type User } from '@stream-io/video-react-native-sdk';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

const streamApiKey = process.env.EXPO_PUBLIC_STREAM_API_KEY;
const callingProfileKey = 'prime_trucking_stream_profile';

type CallingProfile = { id: string; full_name: string; role: string };

/**
 * Stream user tokens are minted by the server-side Supabase Edge Function.
 * The Stream secret is never placed in this mobile app.
 */
export async function connectStreamVideo(profile: CallingProfile) {
  const authenticatedClient = supabase;
  if (!streamApiKey || !authenticatedClient) return undefined;
  const user: User = { id: profile.id, name: profile.full_name, custom: { role: profile.role } };
  const tokenProvider = async () => {
    const { data, error } = await authenticatedClient.functions.invoke('stream-video-token');
    if (error) throw error;
    return (data as { token: string }).token;
  };
  return StreamVideoClient.getOrCreateInstance({
    apiKey: streamApiKey,
    user,
    tokenProvider,
    options: { rejectCallWhenBusy: true },
  });
}

/** Stores only the employee's public calling identity for an incoming call. */
export async function saveCallingProfile(profile: CallingProfile) {
  await SecureStore.setItemAsync(callingProfileKey, JSON.stringify(profile));
}

export async function clearCallingProfile() {
  await SecureStore.deleteItemAsync(callingProfileKey);
}

/** Used by Stream when Android wakes the app to handle an incoming call. */
export async function createStreamVideoClientFromStoredProfile() {
  const value = await SecureStore.getItemAsync(callingProfileKey);
  if (!value) return undefined;
  try {
    const profile = JSON.parse(value) as CallingProfile;
    if (!profile.id || !profile.full_name || !profile.role) return undefined;
    return await connectStreamVideo(profile);
  } catch {
    return undefined;
  }
}
