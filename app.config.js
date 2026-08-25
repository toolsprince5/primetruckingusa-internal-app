const app = require('./app.json');

module.exports = ({ config }) => {
  const base = config ?? app.expo;
  return {
    ...base,
    ios: {
      ...base.ios,
      config: {
        ...base.ios?.config,
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY,
      },
    },
    android: {
      ...base.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || base.android?.googleServicesFile,
      config: {
        ...base.android?.config,
        googleMaps: {
          ...base.android?.config?.googleMaps,
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
        },
      },
    },
  };
};
