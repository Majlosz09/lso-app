-- =============================================================
-- OZNACZENIE NASZYCH / TESTOWYCH DANYCH NA PRODUKCJI
-- Uruchomić dopiero w ETAPIE D (po migracji 20260927000000, która dodaje kolumnę is_test).
-- Przesiew z 2026-09-27 na podstawie docs/security/accounts.csv.
-- =============================================================

-- 1. Nasze parafie
update parishes set is_test = true
where id in (
  'c296b03a-e8e2-4444-976d-9ea149caf8e0',  -- Parafia pw. św. Jacka w Borze Zapilskim (nasza, konta testowe)
  'bc0c3605-f815-4ef1-8932-2d2dde450548',  -- Parafia Wniebowzięcia NMP (test.onboarding@lso.test + test.minister1-3)
  '8540cbe2-f6aa-4dab-a6b4-79e6af8ca749'   -- Parafia Jacka (andrzej.marszalek@outlook.com, starszy.ministrant@outlook.com)
);

-- 2. Kontrola: ile osób jest w naszych parafiach (powinno być 13)
select pa.name, count(p.id) as osob
from parishes pa left join profiles p on p.parish_id = pa.id
where pa.is_test
group by pa.name;

-- 3. (OPCJONALNIE, po decyzji) usunięcie naszych kont testowych bez parafii
-- delete from auth.users where email in ('rodzic.jan@brival.co', 'mlodego.rodzic@outlook.com');
