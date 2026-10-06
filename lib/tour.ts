// Interaktywny przewodnik po aplikacji: kroki dla każdej roli. Przewodnik przechodzi na `route`
// i podświetla element oznaczony <TourTarget id=…>. Gdy elementu nie ma na ekranie (np. pozycja menu,
// której nie ma w dolnym pasku telefonu) — karta pokazuje się na środku.
// Testy: __tests__/lib/tour.test.ts

export type TourRole = 'admin' | 'helper' | 'member' | 'parent'

export type TourStep = {
  title: string
  body: string
  /** ekran, na który przechodzimy przed krokiem */
  route?: string
  /** id elementu <TourTarget> do podświetlenia */
  target?: string
}

export function tourRoleFor(profile: { role?: string | null; is_admin?: boolean | null; is_helper?: boolean | null } | null | undefined): TourRole {
  if (profile?.role === 'parent') return 'parent'
  if (profile?.role === 'admin' || profile?.is_admin) return 'admin'
  if (profile?.is_helper) return 'helper'
  return 'member'
}

const PROFILE_STEP = (body: string, route: string): TourStep => ({ route, target: 'profile', title: 'Twój profil', body })
const RESTART = 'Przewodnik uruchomisz ponownie w Profilu → „Instruktaż aplikacji”.'

const ADMIN_HOME = '/(admin)/(admin-tabs)'
const ADMIN: TourStep[] = [
  { route: ADMIN_HOME, title: 'Witaj w LSO App', body: `Pokażę Ci w dwie minuty, gdzie co jest. Możesz przerwać w każdej chwili. ${RESTART}` },
  { route: ADMIN_HOME, target: 'admin:todo', title: 'Pulpit — co wymaga uwagi',
    body: 'Usprawiedliwienia do rozpatrzenia, osoby gotowe do awansu, nowe konta do zatwierdzenia i służby bez obsady. Kliknij pozycję, żeby od razu się tym zająć.' },
  { route: '/(admin)/(admin-tabs)/schedules', target: 'nav:schedules', title: 'Grafik',
    body: 'Tydzień służb z obsadą: zielone — obsadzone, czerwone — brak ministranta. Kliknij służbę, żeby przypisać osoby, zaznaczyć obecność albo zmienić szczegóły.' },
  { route: '/(admin)/(admin-tabs)/schedules', target: 'schedules:add', title: 'Dodawanie i układanie grafiku',
    body: 'Jednorazowa służba, cykl (np. roraty), wydruk na A4 z kodem QR oraz „Ułóż grafik” — sprawiedliwa propozycja obsady na tydzień albo miesiąc.' },
  { route: '/(admin)/parish-settings', target: 'settings:config', title: 'Rozkład Mszy i konfiguracja',
    body: 'Stały rozkład Mszy i zmiany na okresy (październik z różańcem, Adwent z roratami — daty świąt liczą się same co roku), kościoły i kaplice, funkcje liturgiczne, tryb zakrystii na tablet, reguły punktowania z własnymi kategoriami, wyzwania i rangi.' },
  { route: '/(admin)/parish-settings', target: 'settings:public', title: 'Grafik dla rodziców',
    body: 'Link do grafiku bez logowania — wyślij go rodzicom albo powieś kod QR w zakrystii.' },
  { route: '/(admin)/(admin-tabs)/members', target: 'nav:members', title: 'Członkowie',
    body: 'Zatwierdzasz nowe konta i otwierasz profil ministranta: ranga, funkcje, punkty, frekwencja, uprawnienia pomocnika opiekuna.' },
  { route: '/(admin)/(admin-tabs)/members', target: 'members:import', title: 'Dodaj / importuj',
    body: 'Wklej listę z Excela albo dodaj dzieci bez telefonu — każde dostaje osobisty kod, którym później samo założy konto.' },
  { route: '/(admin)/absence-requests', target: 'nav:excuses', title: 'Zgłoszenia',
    body: 'Usprawiedliwienia nieobecności i zgłoszenia obecności po fakcie (do 48 h). Przyjmujesz albo odrzucasz jednym kliknięciem.' },
  { route: '/(admin)/(admin-tabs)/points', target: 'nav:points', title: 'Punkty',
    body: 'Ranking parafii, ręczne przyznawanie punktów (także z gotowych kategorii parafii), odznaki i wyzwania sezonowe.' },
  { route: '/(admin)/statistics', target: 'nav:statistics', title: 'Statystyki i raport',
    body: 'Frekwencja i obsada, eksport do pliku oraz raport miesięczny dla proboszcza — przychodzi też sam pierwszego dnia miesiąca.' },
  { route: '/(admin)/(admin-tabs)/announcements', target: 'nav:announcements', title: 'Ogłoszenia',
    body: 'Ogłoszenia dla ministrantów i rodziców — z przypięciem i powiadomieniem w telefonie.' },
  { route: '/(admin)/(admin-tabs)/chat', target: 'nav:chat', title: 'Czat',
    body: 'Rozmowy z grupą i prywatne wiadomości. Zgłoszone wiadomości przeglądasz w Ustawieniach parafii.' },
  { route: '/(admin)/wiedza', target: 'nav:wiedza', title: 'Wiedza',
    body: 'To samo, co widzą ministranci: modlitwy, słowniczek, ceremoniał, części Mszy. Własne wpisy parafii dodasz przyciskiem „Wpisy parafii”.' },
  PROFILE_STEP('Wygląd aplikacji (jasny, ciemny albo jak w telefonie), grafik w kalendarzu telefonu, zmiana hasła i ten przewodnik.', ADMIN_HOME),
  { route: ADMIN_HOME, title: 'Gotowe!', body: 'Zacznij od Ustawień parafii → Rozkład Mszy Świętych — z rozkładu powstaje grafik. Szczęść Boże!' },
]

const MEMBER_HOME = '/(tabs)'
const memberSteps = (helper: boolean): TourStep[] => [
  { route: MEMBER_HOME, title: 'Witaj w LSO App', body: `Pokażę Ci w minutę, gdzie co jest. Możesz przerwać w każdej chwili. ${RESTART}` },
  { route: MEMBER_HOME, target: 'home:next', title: 'Twoja najbliższa służba',
    body: 'Dom pokazuje najbliższy dyżur, wyzwania sezonowe (np. roraty), prośby o zamianę i obecności czekające na wysłanie.' },
  ...(helper ? [{ route: MEMBER_HOME, target: 'helper:card', title: 'Pomocnik opiekuna',
    body: 'Jako pomocnik masz dostęp do grafiku parafii, zgłoszeń i trybu zakrystii — pomagasz opiekunowi.' }] : []),
  { route: MEMBER_HOME, target: 'nav:attendance', title: 'Potwierdź obecność',
    body: 'Złoty przycisk. Potwierdzasz obecność przyciskiem, kodem QR z zakrystii albo przez GPS. Bez internetu też działa — obecność wyśle się sama. Zapomniałeś? „Zgłoś obecność” do 48 godzin.' },
  { route: '/(tabs)/schedule', target: 'nav:schedule', title: 'Grafik',
    body: 'Zapisujesz się na wolne Msze (raz albo co tydzień), wypisujesz, zgłaszasz nieobecność albo prosisz kolegę o zamianę. Przyszedłeś bez zapisu? Obecność i tak się liczy.' },
  { route: '/(tabs)/points', target: 'nav:points', title: 'Punkty',
    body: 'Twoje punkty, ranking parafii, odznaki i ścieżka formacji — widać, czego brakuje do kolejnego stopnia.' },
  { route: '/(tabs)/chat', target: 'nav:chat', title: 'Czat', body: 'Rozmowy z grupą ministrantów i z opiekunem.' },
  { route: '/(tabs)/wiedza', target: 'nav:wiedza', title: 'Wiedza',
    body: 'Modlitwy ministranta, słowniczek liturgiczny, ceremoniał i części Mszy Świętej.' },
  PROFILE_STEP('Wygląd aplikacji (jasny, ciemny albo jak w telefonie), Twoje funkcje (np. lektor), grafik w kalendarzu telefonu i ten przewodnik.', MEMBER_HOME),
  { route: MEMBER_HOME, title: 'Gotowe!', body: 'Zapisz się na pierwszą służbę w Grafiku. Szczęść Boże!' },
]

const PARENT_HOME = '/(parent)/(parent-tabs)'
const PARENT: TourStep[] = [
  { route: PARENT_HOME, title: 'Witaj w LSO App', body: `Pokażę Ci w minutę, gdzie co jest. Możesz przerwać w każdej chwili. ${RESTART}` },
  { route: PARENT_HOME, target: 'nav:home', title: 'Dom', body: 'Najbliższe dyżury Twoich dzieci, ich punkty i postępy.' },
  { route: '/(parent)/(parent-tabs)/schedule', target: 'nav:schedule', title: 'Dyżury dzieci',
    body: 'Zapisujesz dziecko na wolną Mszę, zgłaszasz jego nieobecność albo obecność po fakcie (do 48 h) i widzisz, co opiekun z tym zrobił.' },
  { route: '/(parent)/(parent-tabs)/points', target: 'nav:points', title: 'Punkty', body: 'Punkty, ranking i ścieżka formacji dzieci.' },
  { route: '/(parent)/(parent-tabs)/announcements', target: 'nav:announcements', title: 'Ogłoszenia',
    body: 'Informacje od opiekuna: zmiany w grafiku, wyjazdy, uroczystości.' },
  { route: '/(parent)/(parent-tabs)/chat', target: 'nav:chat', title: 'Czat', body: 'Wiadomości od opiekuna i innych rodziców.' },
  PROFILE_STEP('Powiązane dzieci, wygląd aplikacji (jasny, ciemny albo jak w telefonie), grafik w kalendarzu telefonu i ten przewodnik.', PARENT_HOME),
  { route: PARENT_HOME, title: 'Gotowe!', body: 'W „Dyżurach dzieci” zapiszesz dziecko na pierwszą służbę. Szczęść Boże!' },
]

export function tourSteps(role: TourRole): TourStep[] {
  if (role === 'admin') return ADMIN
  if (role === 'parent') return PARENT
  return memberSteps(role === 'helper')
}

export type Rect = { x: number; y: number; width: number; height: number }

/** Czy element jest widoczny w oknie (inaczej karta na środku). */
export function usableRect(r: Rect | null | undefined, win: { width: number; height: number }): boolean {
  if (!r || r.width < 4 || r.height < 4) return false
  return r.y + r.height > 8 && r.y < win.height - 24 && r.x + r.width > 8 && r.x < win.width - 8
}

/** Pozycja karty: pod elementem, nad nim, obok (wysoki element na szerokim ekranie), a w ostateczności u dołu ekranu. */
export function cardPlacement(r: Rect | null, win: { width: number; height: number }, card: { width: number; height: number }, gap = 14) {
  const w = Math.min(card.width, win.width - 32)
  const clampTop = (t: number) => Math.max(16, Math.min(t, win.height - card.height - 16))
  const centerLeft = (x: number) => Math.min(Math.max(16, x - w / 2), win.width - w - 16)
  if (!r) return { left: (win.width - w) / 2, top: Math.max(24, (win.height - card.height) / 2), width: w, side: 'center' as const }
  if (r.y + r.height + gap + card.height <= win.height - 16) return { left: centerLeft(r.x + r.width / 2), top: r.y + r.height + gap, width: w, side: 'below' as const }
  if (r.y - gap - card.height >= 16) return { left: centerLeft(r.x + r.width / 2), top: r.y - gap - card.height, width: w, side: 'above' as const }
  if (win.width - (r.x + r.width) - gap >= w + 16) return { left: r.x + r.width + gap, top: clampTop(r.y), width: w, side: 'right' as const }
  if (r.x - gap >= w + 16) return { left: r.x - gap - w, top: clampTop(r.y), width: w, side: 'left' as const }
  return { left: centerLeft(r.x + r.width / 2), top: win.height - card.height - 16, width: w, side: 'over' as const }
}
