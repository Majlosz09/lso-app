const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Allow Babel to transform zustand (which uses import.meta in its devtools middleware)
config.transformer.transformIgnorePatterns = [
  'node_modules/(?!(react-native|@react-native|@react-navigation|expo|@expo|@unimodules|unimodules|sentry-expo|native-base|react-native-svg|zustand|@supabase|react-native-url-polyfill|react-native-reanimated|react-native-screens|react-native-safe-area-context|react-native-calendars|react-native-qrcode-svg)/)',
];

module.exports = config;
