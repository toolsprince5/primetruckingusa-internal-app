import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { StreamVideoRN } from '@stream-io/video-react-native-sdk';
import App from './App';
import { createStreamVideoClientFromStoredProfile } from './src/lib/stream-video';

// This must run before the app is registered so Android can wake the app for a
// genuine incoming Stream call. Provider names are public aliases created in
// the Stream dashboard; they are intentionally supplied by build variables.
if (Platform.OS !== 'web') {
  StreamVideoRN.setPushConfig({
    android: {
      pushProviderName: process.env.EXPO_PUBLIC_STREAM_FCM_PROVIDER_NAME,
      incomingChannel: { id: 'prime_trucking_calls', name: 'Prime Trucking USA calls', vibration: true },
      titleTransformer: (name, incoming) => incoming ? `${name} is calling` : `Calling ${name}`,
    },
    ios: {
      pushProviderName: process.env.EXPO_PUBLIC_STREAM_APN_PROVIDER_NAME,
      supportsVideo: true,
    },
    shouldRejectCallWhenBusy: true,
    createStreamVideoClient: createStreamVideoClientFromStoredProfile,
  });
}

registerRootComponent(App);
