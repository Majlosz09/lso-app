import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

jest.mock('../../lib/ThemeContext', () => ({
  useTheme: () => ({
    colors: require('../../lib/theme').lightColors,
    isDark: false,
    scheme: 'light',
  }),
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

const { MemberRow } = require('../../components/MemberRow')

const baseMember = {
  id: 'u1',
  full_name: 'Jan Kowalski',
  role: 'member' as const,
  phone: '600100200',
  rocznik: 2010,
  total_points: 42,
}

describe('MemberRow', () => {
  it('renders member name', () => {
    const { getByText } = render(<MemberRow member={baseMember} onPress={jest.fn()} />)
    expect(getByText('Jan Kowalski')).toBeTruthy()
  })

  it('renders phone number', () => {
    const { getByText } = render(<MemberRow member={baseMember} onPress={jest.fn()} />)
    expect(getByText(/600100200/)).toBeTruthy()
  })

  it('shows rocznik for member role', () => {
    const { getByText } = render(<MemberRow member={baseMember} onPress={jest.fn()} />)
    expect(getByText(/rocznik 2010/)).toBeTruthy()
  })

  it('shows points badge for member role', () => {
    const { getByText } = render(<MemberRow member={baseMember} onPress={jest.fn()} />)
    expect(getByText('42')).toBeTruthy()
  })

  it('does not show rocznik for parent role', () => {
    const parent = { ...baseMember, role: 'parent' as const, rocznik: null }
    const { queryByText } = render(<MemberRow member={parent} onPress={jest.fn()} />)
    expect(queryByText(/rocznik/)).toBeNull()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    const { getByText } = render(<MemberRow member={baseMember} onPress={onPress} />)
    fireEvent.press(getByText('Jan Kowalski'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
