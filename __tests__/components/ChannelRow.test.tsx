import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

jest.mock('../../lib/ThemeContext', () => ({
  useTheme: () => ({
    colors: require('../../lib/theme').lightColors,
    isDark: false,
    scheme: 'light',
  }),
}))

// Required after mocks
const { ChannelRow } = require('../../components/chat/ChannelRow')

const baseChannel = {
  id: 'ch1',
  parish_id: 'p1',
  type: 'group' as const,
  name: 'Ministranci',
  slug: 'ministranci',
  created_at: '2026-01-01T00:00:00Z',
  last_message_content: 'Cześć wszystkim',
  last_message_at: '2026-01-01T10:30:00Z',
  last_message_type: 'text' as const,
  unread_count: 0,
}

describe('ChannelRow', () => {
  it('renders group channel name with # prefix', () => {
    const { getByText } = render(<ChannelRow item={baseChannel} onPress={jest.fn()} />)
    expect(getByText('#Ministranci')).toBeTruthy()
  })

  it('renders last message content', () => {
    const { getByText } = render(<ChannelRow item={baseChannel} onPress={jest.fn()} />)
    expect(getByText('Cześć wszystkim')).toBeTruthy()
  })

  it('shows unread badge when unread_count > 0', () => {
    const { getByText } = render(
      <ChannelRow item={{ ...baseChannel, unread_count: 5 }} onPress={jest.fn()} />
    )
    expect(getByText('5')).toBeTruthy()
  })

  it('shows 99+ when unread_count > 99', () => {
    const { getByText } = render(
      <ChannelRow item={{ ...baseChannel, unread_count: 150 }} onPress={jest.fn()} />
    )
    expect(getByText('99+')).toBeTruthy()
  })

  it('shows poll indicator for poll type messages', () => {
    const pollChannel = {
      ...baseChannel,
      last_message_content: 'Kiedy msza?',
      last_message_type: 'poll' as const,
    }
    const { getByText } = render(<ChannelRow item={pollChannel} onPress={jest.fn()} />)
    expect(getByText('📊 Ankieta')).toBeTruthy()
  })

  it('shows placeholder when no last message', () => {
    const emptyChannel = { ...baseChannel, last_message_content: null, last_message_at: null }
    const { getByText } = render(<ChannelRow item={emptyChannel} onPress={jest.fn()} />)
    expect(getByText('Brak wiadomości')).toBeTruthy()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    const { getByText } = render(<ChannelRow item={baseChannel} onPress={onPress} />)
    fireEvent.press(getByText('#Ministranci'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
