import { supabase } from './supabase'

/** Ile osób ma ten stopień (usunięcie stopnia w użyciu baza odrzuca kluczem obcym). */
export async function rankHolders(rankId: string): Promise<number> {
  const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('rank_id', rankId)
  return count ?? 0
}

export const rankInUseMessage = (n: number) => ({
  text1: `Ten stopień ma ${n} ${n === 1 ? 'osoba' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'osoby' : 'osób'}`,
  text2: 'Najpierw zmień im stopień, potem usuń ten.',
})
