-- =============================================================
-- KOMUNIKAT „NOWOŚCI” — wrzesień 2026
-- Uruchom w SQL Editor (najpierw LSO-dev do sprawdzenia, potem LSO).
-- Każda osoba zobaczy go raz, po otwarciu aplikacji. Wygasa po 30 dniach.
-- Linie zaczynające się od „• ” wyświetlają się jako punkty.
-- =============================================================

-- Dla administratorów (księża / opiekunowie grup)
insert into app_announcements (title, body, audience, expires_at) values (
'Nowości w LSO App',
'Wprowadziliśmy sporo zmian — najważniejsze dla Ciebie jako administratora:
• Zatwierdzanie nowych członków: osoby dołączające kodem czekają teraz na Twoją akceptację (żółty baner na Panelu, zakładka Ministranci). Dzięki temu do danych dzieci mają dostęp tylko osoby z parafii.
• Stałe dyżury: w Grafikach → „Stałe dyżury ministrantów” przypiszesz ministranta do tej samej Mszy co tydzień, nawet na rok. Cofnięcie — jednym przyciskiem.
• Profil członka → Zarządzanie: usunięcie z parafii oraz zmiana ministrant ↔ rodzic.
• Nowy tryb obecności „Tylko admin” — obecność zaznacza ksiądz (Ustawienia parafii).
• Poprawione liczenie punktów: obecność liczyła się dotąd podwójnie, dlatego rankingi mogły się zmniejszyć — teraz są zgodne z Twoimi regułami punktacji.
• Zgłoszenia z czatu (Panel → „Zgłoszenia z czatu”), reset hasła na ekranie logowania, eksport danych i usuwanie konta w profilu.
Dziękujemy za korzystanie z aplikacji! Uwagi i pytania: lsoapp@parafia-borzapilski.pl',
array['admin'],
now() + interval '30 days'
);

-- Dla ministrantów i rodziców
insert into app_announcements (title, body, audience, expires_at) values (
'Nowości w LSO App',
'Aplikacja została odświeżona i lepiej zabezpieczona. Co nowego:
• Poprawione punkty: obecność liczyła się dotąd podwójnie, dlatego Twój wynik w rankingu mógł się zmniejszyć — teraz jest liczony zgodnie z zasadami parafii.
• Stałe dyżury: ksiądz może przypisać Cię do tej samej Mszy co tydzień — zobaczysz je od razu w Dyżurach.
• Nie pamiętasz hasła? Na ekranie logowania możesz je zresetować mailem.
• Na czacie możesz zgłosić niestosowną wiadomość (przytrzymaj wiadomość → „Zgłoś administratorowi”).
• W profilu: „Pobierz moje dane” i „Usuń konto”.
Szczęść Boże! Pytania: lsoapp@parafia-borzapilski.pl',
array['member', 'parent'],
now() + interval '30 days'
);

-- Kontrola: ile osób ma zobaczyć każdy komunikat
select a.audience, count(p.id) as odbiorcow
  from app_announcements a
  join profiles p on p.approved and p.parish_id is not null and p.created_at < a.published_at
   and (case when p.role = 'admin' or p.is_admin then 'admin' else p.role end) = any (a.audience)
 where a.expires_at > now()
 group by a.audience;
