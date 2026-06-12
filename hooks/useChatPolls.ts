import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ChatPoll } from '../types/chat'

export function useChatPolls(userId: string) {
  
  const vote = useCallback(async (poll: ChatPoll, optionId: string) => {
    // 1. Zabezpieczenie przed głosowaniem w zamkniętej ankiecie
    if (poll.closed_at) {
      console.warn('[useChatPolls] Próba głosowania w zamkniętej ankiecie.')
      return
    }

    try {
      if (poll.allow_multiple) {
        const option = poll.options.find((o) => o.id === optionId)
        const existing = option?.votes.find((v) => v.user_id === userId)

        if (existing) {
          // Cofnięcie głosu z konkretnej opcji
          const { error } = await supabase
            .from('chat_poll_votes')
            .delete()
            .eq('id', existing.id)
            .eq('user_id', userId)
          
          if (error) throw error
        } else {
          // Dodanie głosu do opcji
          const { error } = await supabase
            .from('chat_poll_votes')
            .insert({ option_id: optionId, user_id: userId })
          
          if (error) throw error
        }
      } else {
        // --- ANKIETA POJEDYNCZEGO WYBORU ---
        let existingVote: any = null
        let existingOptionId: string | null = null

        // Bezpieczne szukanie czy i gdzie użytkownik już zagłosował
        for (const option of poll.options) {
          const v = option.votes.find((v) => v.user_id === userId)
          if (v) {
            existingVote = v
            existingOptionId = option.id
            break
          }
        }

        if (existingVote) {
          // POPRAWKA: Jeśli kliknięto TĘ SAMĄ opcję -> działamy jak toggle (usuwamy głos i kończymy)
          if (existingOptionId === optionId) {
            const { error } = await supabase
              .from('chat_poll_votes')
              .delete()
              .eq('id', existingVote.id)
              .eq('user_id', userId)
            
            if (error) throw error
            return
          }

          // Jeśli kliknięto INNĄ opcję -> usuwamy stary głos przed wstawieniem nowego
          const { error: deleteError } = await supabase
            .from('chat_poll_votes')
            .delete()
            .eq('id', existingVote.id)
            .eq('user_id', userId)
          
          if (deleteError) throw deleteError
        }

        // Wstawienie nowego głosu
        const { error: insertError } = await supabase
          .from('chat_poll_votes')
          .insert({ option_id: optionId, user_id: userId })
        
        if (insertError) throw insertError
      }
    } catch (err: any) {
      console.error('[useChatPolls] Błąd podczas przetwarzania głosu:', err.message || err)
      // Tutaj możesz dodać np. wywołanie toastu z powiadomieniem dla użytkownika
    }
  }, [userId])

  const closePoll = useCallback(async (pollId: string) => {
    try {
      const { error } = await supabase
        .from('chat_polls')
        .update({ closed_at: new Date().toISOString() })
        .eq('id', pollId)

      if (error) throw error
    } catch (err: any) {
      console.error('[useChatPolls] Błąd podczas zamykania ankiety:', err.message || err)
    }
  }, [])

  return { vote, closePoll }
}