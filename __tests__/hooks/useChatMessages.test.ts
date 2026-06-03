// __tests__/hooks/useChatMessages.test.ts
import { renderHook, waitFor } from '@testing-library/react-native'
import { useChatMessages } from '../../hooks/useChatMessages'

const mockChannel = { on: jest.fn().mockReturnThis(), subscribe: jest.fn().mockReturnThis() }

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn(),
  },
}))

describe('useChatMessages', () => {
  it('starts loading and resolves to empty array', async () => {
    const { result } = renderHook(() => useChatMessages('channel-123'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.messages).toEqual([])
  })

  it('subscribes to realtime on mount', async () => {
    const { supabase } = require('../../lib/supabase')
    renderHook(() => useChatMessages('channel-abc'))
    await waitFor(() => expect(supabase.channel).toHaveBeenCalledWith('chat-messages-channel-abc'))
  })

  it('unsubscribes on unmount', async () => {
    const { supabase } = require('../../lib/supabase')
    const { unmount } = renderHook(() => useChatMessages('channel-xyz'))
    unmount()
    expect(supabase.removeChannel).toHaveBeenCalled()
  })
})
