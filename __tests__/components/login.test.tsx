import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'

const mockSignIn = jest.fn()

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignIn,
    },
  },
}))

jest.mock('../../lib/ThemeContext', () => ({
  useTheme: () => ({
    colors: require('../../lib/theme').lightColors,
    isDark: false,
    scheme: 'light',
  }),
}))

// LoginScreen is required after mocks to ensure supabase factory runs after mockSignIn is defined
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LoginScreen = require('../../app/(auth)/login').default

beforeEach(() => {
  mockSignIn.mockReset()
})

describe('LoginScreen', () => {
  it('renders email and password inputs', () => {
    const { getByPlaceholderText } = render(<LoginScreen />)
    expect(getByPlaceholderText('Email')).toBeTruthy()
    expect(getByPlaceholderText('Hasło')).toBeTruthy()
  })

  it('shows error when both fields are empty', async () => {
    const { getByText } = render(<LoginScreen />)
    fireEvent.press(getByText('Zaloguj się'))
    await waitFor(() => {
      expect(getByText('Wypełnij email i hasło')).toBeTruthy()
    })
  })

  it('does not call supabase when fields are empty', async () => {
    const { getByText } = render(<LoginScreen />)
    fireEvent.press(getByText('Zaloguj się'))
    await waitFor(() => {
      expect(mockSignIn).not.toHaveBeenCalled()
    })
  })

  it('calls signInWithPassword with correct email and password', async () => {
    mockSignIn.mockResolvedValue({ error: null })

    const { getByPlaceholderText, getByText } = render(<LoginScreen />)
    fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com')
    fireEvent.changeText(getByPlaceholderText('Hasło'), 'secret123')
    fireEvent.press(getByText('Zaloguj się'))

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'secret123',
      })
    })
  })

  it('shows translated error on invalid credentials', async () => {
    mockSignIn.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    })

    const { getByPlaceholderText, getByText } = render(<LoginScreen />)
    fireEvent.changeText(getByPlaceholderText('Email'), 'wrong@example.com')
    fireEvent.changeText(getByPlaceholderText('Hasło'), 'wrongpass')
    fireEvent.press(getByText('Zaloguj się'))

    await waitFor(() => {
      expect(getByText('Nieprawidłowy email lub hasło')).toBeTruthy()
    })
  })
})
