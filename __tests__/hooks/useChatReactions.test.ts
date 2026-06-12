import { renderHook, act } from '@testing-library/react-native'
import { useChatReactions } from '../../hooks/useChatReactions'

const mockInsert = jest.fn().mockResolvedValue({ error: null })
const mockUpdate = jest.fn().mockReturnValue({
  eq: jest.fn().mockResolvedValue({ error: null }),
})

const mockFrom = {
  insert: mockInsert,
  update: mockUpdate,
}

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(() => mockFrom) },
}))

describe('useChatReactions', () => {
  const userId = 'user-1'

  beforeEach(() => jest.clearAllMocks())

  it('calls insert when user has no existing reaction', async () => {
    const { result } = renderHook(() => useChatReactions(userId))
    await act(async () => {
      await result.current.toggleReaction('msg-1', '👍', [])
    })
    expect(mockInsert).toHaveBeenCalledWith(
      { message_id: 'msg-1', user_id: userId, emoji: '👍' },
    )
  })

  it('calls update when user changes to a different emoji (confirmed reaction)', async () => {
    const existing = [{ id: 'r-1', message_id: 'msg-1', user_id: userId, emoji: '👍', created_at: '' }]
    const { result } = renderHook(() => useChatReactions(userId))
    await act(async () => {
      await result.current.toggleReaction('msg-1', '❤️', existing)
    })
    expect(mockUpdate).toHaveBeenCalledWith({ emoji: '❤️' })
    expect(mockUpdate().eq).toHaveBeenCalledWith('id', 'r-1')
  })

  it('calls insert when user changes emoji but previous reaction is still optimistic', async () => {
    const existing = [{ id: 'opt-123', message_id: 'msg-1', user_id: userId, emoji: '👍', created_at: '' }]
    const { result } = renderHook(() => useChatReactions(userId))
    await act(async () => {
      await result.current.toggleReaction('msg-1', '❤️', existing)
    })
    expect(mockInsert).toHaveBeenCalledWith(
      { message_id: 'msg-1', user_id: userId, emoji: '❤️' },
    )
  })

  it('is a no-op when user clicks the same emoji they already have', async () => {
    const existing = [{ id: 'r-1', message_id: 'msg-1', user_id: userId, emoji: '👍', created_at: '' }]
    const { result } = renderHook(() => useChatReactions(userId))
    let returnValue: any
    await act(async () => {
      returnValue = await result.current.toggleReaction('msg-1', '👍', existing)
    })
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(returnValue).toEqual({ success: true })
  })
})
