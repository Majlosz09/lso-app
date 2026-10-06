// „Co nowego” — pokazywane raz każdemu dotychczasowemu użytkownikowi po wejściu w nową wersję.
// Nowa wersja = nowe RELEASE_ID (stary znacznik „widziane” przestaje pasować). Testy: __tests__/lib/releaseNotes.test.ts
import type { TourRole } from './tour'

export const RELEASE_ID = '2026-10-v2'

export type ReleaseItem = { icon: string; title: string; text: string }

const LOOK: ReleaseItem = {
  icon: 'palette', title: 'Nowy wygląd',
  text: 'Nagłówki w kolorze szat liturgicznych dnia, tryb jasny i ciemny (Profil → Wygląd) i wygodna wersja na komputer.',
}
const CALENDAR: ReleaseItem = {
  icon: 'calendar-sync', title: 'Grafik w kalendarzu telefonu',
  text: 'Twoje służby same pojawiają się w kalendarzu Google albo Apple — włączysz to w Profilu.',
}

const ADMIN: ReleaseItem[] = [
  LOOK,
  { icon: 'clock-outline', title: 'Rozkład Mszy z okresami',
    text: 'Stały tydzień i zmiany na okresy: październik z różańcem, Adwent z roratami, święta. Daty świąt i okresów liturgicznych liczą się same co roku. Zbiorcza zmiana godzin i przełącznik zapisów na niedziele.' },
  { icon: 'tune-variant', title: 'Ty decydujesz o każdej Mszy',
    text: 'Zapisy ministrantów, grafik ustalany przez Ciebie albo „bez obecności i punktów”.' },
  { icon: 'check-decagram', title: 'Obecność bez zapisu i po fakcie',
    text: 'Ministrant, który przyszedł bez zapisu, i tak dostaje punkty. Zapomniał potwierdzić — zgłasza obecność do 48 h, a Ty przyjmujesz ją w „Zgłoszeniach”. Potwierdzanie działa też bez internetu.' },
  { icon: 'church', title: 'Kościoły i kaplice',
    text: 'Filie i kaplice, każda z własną lokalizacją GPS do potwierdzania obecności.' },
  { icon: 'auto-fix', title: 'Ułóż grafik, wydruk i link dla rodziców',
    text: 'Sprawiedliwa propozycja obsady na tydzień lub miesiąc, wydruk A4 z kodem QR do zakrystii i grafik dla rodziców bez logowania.' },
  { icon: 'account-multiple-plus', title: 'Import i dzieci bez telefonu',
    text: 'Lista ministrantów wklejona z Excela, osobisty kod do założenia konta i tryb zakrystii na wspólnym tablecie.' },
  { icon: 'school', title: 'Funkcje, pomocnik i ścieżka formacji',
    text: 'Lektor, ceremoniarz, turyferariusz…; ministrant-pomocnik opiekuna; wymagania do kolejnych stopni i lista „gotowi do awansu”. Rangi systemowe włączasz sam.' },
  { icon: 'star-circle', title: 'Punkty po Twojemu',
    text: 'Własne kategorie punktowania (np. Roraty, Pogrzeb, Sprzątanie zakrystii), wyzwania sezonowe z premią i raport miesięczny dla proboszcza.' },
]

const memberItems = (helper: boolean): ReleaseItem[] => [
  LOOK,
  { icon: 'calendar-check', title: 'Zapisy i zamiany',
    text: 'Zapisujesz się na wolną Mszę raz albo co tydzień, prosisz kolegę o zamianę albo zgłaszasz nieobecność.' },
  { icon: 'check-decagram', title: 'Obecność zawsze się liczy',
    text: 'Przyszedłeś bez zapisu — punkty i tak są. Zapomniałeś potwierdzić — „Zgłoś obecność” do 48 h. Bez internetu potwierdzenie wyśle się samo.' },
  { icon: 'trophy', title: 'Wyzwania i ścieżka formacji',
    text: 'Wyzwania sezonowe z premią punktową (np. roraty) i podgląd, czego brakuje do kolejnego stopnia.' },
  ...(helper ? [{ icon: 'account-tie', title: 'Pomocnik opiekuna',
    text: 'Masz dostęp do grafiku parafii, zgłoszeń i trybu zakrystii — karta „Pomocnik opiekuna” na Domu.' }] : []),
  CALENDAR,
  { icon: 'book-open-variant', title: 'Wiedza ministranta',
    text: 'Modlitwy, słowniczek liturgiczny, ceremoniał i części Mszy Świętej w jednym miejscu.' },
]

const PARENT: ReleaseItem[] = [
  LOOK,
  { icon: 'calendar-check', title: 'Dyżury dzieci',
    text: 'Zapiszesz dziecko na wolną Mszę, zgłosisz jego nieobecność albo obecność po fakcie (do 48 h) i zobaczysz, co z tym zrobił opiekun.' },
  { icon: 'chart-line', title: 'Postępy dzieci',
    text: 'Punkty, frekwencja, wyzwania sezonowe i ścieżka formacji każdego dziecka.' },
  CALENDAR,
]

export function releaseItems(role: TourRole): ReleaseItem[] {
  if (role === 'admin') return ADMIN
  if (role === 'parent') return PARENT
  return memberItems(role === 'helper')
}

/** Komu pokazać: zalogowany, zatwierdzony, już korzystał z aplikacji (nowi dostają od razu przewodnik), jeszcze nie widział. */
export function shouldShowRelease(
  profile: { id?: string; parish_id?: string | null; approved?: boolean | null; onboarding_completed?: boolean | null } | null | undefined,
  seen: string | null,
): boolean {
  if (!profile?.id || !profile.parish_id || profile.approved === false) return false
  if (profile.onboarding_completed === false) return false
  return seen !== RELEASE_ID
}

export const releaseSeenKey = (profileId: string) => `release-seen:${profileId}`
