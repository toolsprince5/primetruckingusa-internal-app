import { StreamVideoClient, type User } from '@stream-io/video-react-native-sdk';
import { supabase } from './supabase';

const streamApiKey = process.env.EXPO_PUBLIC_STREAM_API_KEY;

/**
 * Stream user tokens are minted by the server-side Supabase Edge Function.
 * The Stream secret is never placed in this mobile app.
 */
export async function connectStreamVideo(profile: { id: string; full_name: string; role: string }) {
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
