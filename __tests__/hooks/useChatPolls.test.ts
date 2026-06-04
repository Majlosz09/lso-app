import { renderHook, act } from '@testing-library/react-native'
import { useChatPolls } from '../../hooks/useChatPolls'
import { ChatPoll } from '../../types/chat'

// All terminal operations use .match() — simplifies mock chaining
const mockFrom = {
  delete: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  insert: jest.fn().mockResolvedValue({ error: null }),
  match: jest.fn().mockResolvedValue({ error: null }),
}

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(() => mockFrom) },
}))

const basePoll: ChatPoll = {
  id: 'poll-1', channel_id: 'ch-1', creator_id: 'user-creator',
  question: 'Test?', allow_multiple: false, closed_at: null, created_at: '',
  options: [
    { id: 'opt-1', poll_id: 'poll-1', text: 'A', position: 0, votes: [] },
    { id: 'opt-2', poll_id: 'poll-1', text: 'B', position: 1, votes: [] },
  ],
}

describe('useChatPolls', () => {
  const userId = 'user-1'

  beforeEach(() => jest.clearAllMocks())

  it('single choice: deletes old vote by id then inserts new', async () => {
    const poll = {
      ...basePoll,
      options: [
        { ...basePoll.options[0], votes: [{ id: 'v-1', option_id: 'opt-1', user_id: userId, created_at: '' }] },
        basePoll.options[1],
      ],
    }
    const { result } = renderHook(() => useChatPolls(userId))
    await act(async () => { await result.current.vote(poll, 'opt-2') })
    expect(mockFrom.delete).toHaveBeenCalled()
    expect(mockFrom.match).toHaveBeenCalledWith({ id: 'v-1', user_id: userId })
    expect(mockFrom.insert).toHaveBeenCalledWith({ option_id: 'opt-2', user_id: userId })
  })

  it('single choice: only inserts when no existing vote', async () => {
    const { result } = renderHook(() => useChatPolls(userId))
    await act(async () => { await result.current.vote(basePoll, 'opt-1') })
    expect(mockFrom.delete).not.toHaveBeenCalled()
    expect(mockFrom.insert).toHaveBeenCalledWith({ option_id: 'opt-1', user_id: userId })
  })

  it('multi choice: deletes when toggling off existing vote', async () => {
    const poll = {
      ...basePoll, allow_multiple: true,
      options: [
        { ...basePoll.options[0], votes: [{ id: 'v-1', option_id: 'opt-1', user_id: userId, created_at: '' }] },
        basePoll.options[1],
      ],
    }
    const { result } = renderHook(() => useChatPolls(userId))
    await act(async () => { await result.current.vote(poll, 'opt-1') })
    expect(mockFrom.delete).toHaveBeenCalled()
    expect(mockFrom.insert).not.toHaveBeenCalled()
  })

  it('closePoll: updates closed_at via match', async () => {
    const { result } = renderHook(() => useChatPolls(userId))
    await act(async () => { await result.current.closePoll('poll-1') })
    expect(mockFrom.update).toHaveBeenCalledWith(expect.objectContaining({ closed_at: expect.any(String) }))
    expect(mockFrom.match).toHaveBeenCalledWith({ id: 'poll-1' })
  })
})
