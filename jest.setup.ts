// Jest setup - mock React Native and Supabase dependencies
import '@react-native-async-storage/async-storage'

// Mock AsyncStorage for testing
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}))

// Mock expo-location
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: {
    High: 4,
  },
}))

// Mock supabase to prevent real client initialization in tests that don't override it
jest.mock('./lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn(),
      update: jest.fn(),
      eq: jest.fn(),
    })),
    auth: {
      signInWithPassword: jest.fn(),
    },
  },
}))

