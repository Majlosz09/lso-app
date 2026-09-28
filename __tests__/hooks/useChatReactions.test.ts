import { renderHook, act } from '@testing-library/react-native'
import { useChatReactions } from '../../hooks/useChatReactions'

// Hook: jedna reakcja na użytkownika — upsert (nowa / zmiana emoji), ponowne kliknięcie tej samej = usunięcie
const mockUpsert = jest.fn().mockResolvedValue({ error: null })
const mockDeleteEq2 = jest.fn().mockResolvedValue({ error: null })
const mockDeleteEq1 = jest.fn(() => ({ eq: mockDeleteEq2 }))
const mockDelete = jest.fn(() => ({ eq: mockDeleteEq1 }))

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(() => ({ upsert: mockUpsert, delete: mockDelete })) },
}))

describe('useChatReactions', () => {
  const userId = 'user-1'

  beforeEach(() => jest.clearAllMocks())

  it('upserts a new reaction when user has none', async () => {
    const { result } = renderHook(() => useChatReactions(userId))
    let res: any
    await act(async () => {
      res = await result.current.toggleReaction('msg-1', '👍', [])
    })
    expect(mockUpsert).toHaveBeenCalledWith(
      { message_id: 'msg-1', user_id: userId, emoji: '👍' },
      { onConflict: 'message_id,user_id' },
    )
    expect(res).toEqual({ success: true })
  })

  it('upserts the new emoji when user changes reaction', async () => {
    const existing = [{ id: 'r-1', message_id: 'msg-1', user_id: userId, emoji: '👍', created_at: '' }]
    const { result } = renderHook(() => useChatReactions(userId))
    await act(async () => {
      await result.current.toggleReaction('msg-1', '❤️', existing)
    })
    expect(mockUpsert).toHaveBeenCalledWith(
      { message_id: 'msg-1', user_id: userId, emoji: '❤️' },
      { onConflict: 'message_id,user_id' },
    )
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('ignores reactions of other users when deciding', async () => {
    const existing = [{ id: 'r-2', message_id: 'msg-1', user_id: 'someone-else', emoji: '👍', created_at: '' }]
    const { result } = renderHook(() => useChatReactions(userId))
    await act(async () => {
      await result.current.toggleReaction('msg-1', '👍', existing)
    })
    expect(mockUpsert).toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('removes the reaction when user clicks the same emoji again', async () => {
    const existing = [{ id: 'r-1', message_id: 'msg-1', user_id: userId, emoji: '👍', created_at: '' }]
    const { result } = renderHook(() => useChatReactions(userId))
    let res: any
    await act(async () => {
      res = await result.current.toggleReaction('msg-1', '👍', existing)
    })
    expect(mockDelete).toHaveBeenCalled()
    expect(mockDeleteEq1).toHaveBeenCalledWith('message_id', 'msg-1')
    expect(mockDeleteEq2).toHaveBeenCalledWith('user_id', userId)
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(res).toEqual({ success: true })
  })

  it('returns success:false when the database rejects the change', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'RLS' } })
    const { result } = renderHook(() => useChatReactions(userId))
    let res: any
    await act(async () => {
      res = await result.current.toggleReaction('msg-1', '👍', [])
    })
    expect(res.success).toBe(false)
  })
})
