# Zmiany

Format: każda zmiana kodu = wpis w „Nieopublikowane”. Przy wydaniu sekcja przechodzi pod numer wersji (zob. skill `dokumentacja`). Historia sprzed 2026-10-20 jest w `git log` i `docs/plans`/`docs/redesign`.

## Nieopublikowane

### Dla użytkowników
- Usunięcie Mszy z grafiku (np. wyjątkowo się nie odbywa) odwołuje ją w tym dniu: nie wraca już jako „wolne miejsce z rozkładu”, zapisani dostają powiadomienie. Opiekun widzi ją w grafiku jako „odwołana” i może ją przywrócić.

### Techniczne
- Migracja `20261026000000_mass_cancellations.sql`: tabela `mass_cancellations`, `mass_slots()` pomija odwołane pozycje, RPC `cancel_service` / `cancel_mass_slot` / `restore_mass_slot`, trigger `trg_a_schedules_uncancel` (ręczne dodanie służby w odwołanym terminie przywraca pozycję rozkładu).
- Włączono automatyczne pilnowanie dokumentacji (hook Auto-docs).
- Dokumentacja startowa: `docs/README.md`, `ARCHITEKTURA.md`, `BAZA-DANYCH.md` (inwentarz 44 tabel, polityk RLS, ~140 funkcji, triggerów i crona złożony ze schematu produkcji 2026-09-27 + migracji), `funkcje/` (6 modułów), `decyzje/` (ADR 0001–0004).
