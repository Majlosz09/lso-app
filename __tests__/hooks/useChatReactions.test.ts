import { renderHook, act } from '@testing-library/react-native'
import { useChatReactions } from '../../hooks/useChatReactions'

const mockFrom = {
  insert: jest.fn().mockResolvedValue({ error: null }),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  match: jest.fn().mockResolvedValue({ error: null }),
}

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(() => mockFrom) },
}))

describe('useChatReactions', () => {
  const userId = 'user-1'

  beforeEach(() => jest.clearAllMocks())

  it('calls insert when user has not reacted with that emoji', async () => {
    const { result } = renderHook(() => useChatReactions(userId))
    await act(async () => {
      await result.current.toggleReaction('msg-1', '👍', [])
    })
    expect(mockFrom.insert).toHaveBeenCalledWith({
      message_id: 'msg-1', user_id: userId, emoji: '👍',
    })
  })

  it('calls delete when user already reacted with that emoji', async () => {
    const existing = [{ id: 'r-1', message_id: 'msg-1', user_id: userId, emoji: '👍', created_at: '' }]
    const { result } = renderHook(() => useChatReactions(userId))
    await act(async () => {
      await result.current.toggleReaction('msg-1', '👍', existing)
    })
    expect(mockFrom.delete).toHaveBeenCalled()
  })
})
