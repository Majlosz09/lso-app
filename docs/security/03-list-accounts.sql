-- =============================================================
-- LISTA KONT DO PRZESIEWU (TYLKO ODCZYT)
-- "podejrzenie" = podpowiedź na podstawie maila i nazwy parafii; decyzja należy do Ciebie.
-- Uzupełnij tablice wzorców, jeśli znasz inne swoje/testowe adresy lub parafie.
-- =============================================================
with patterns as (
  select
    array['%@lso.test', 'milosz.jakubczak@%', '%@brival.co', 'michal.krawczyk@%',
          '%test%', '%@da.pl', '%@example.%'] as email_like,
    array['%test%', '%jac%', '%demo%'] as parish_like
)
select
  case
    when u.email ilike any (pt.email_like) then 'NASZE / TESTOWE?'
    when pa.name ilike any (pt.parish_like) then 'NASZE / TESTOWE? (parafia)'
    else 'PRAWDZIWE?'
  end                              as podejrzenie,
  u.email,
  p.full_name                      as imie_nazwisko,
  p.role                           as rola,
  pa.name                          as parafia,
  pa.id                            as parafia_id,
  u.created_at::date               as zalozone,
  u.last_sign_in_at::date          as ostatnie_logowanie,
  u.email_confirmed_at is not null as email_potwierdzony,
  u.id                             as user_id
from auth.users u
cross join patterns pt
left join profiles p  on p.id = u.id
left join parishes pa on pa.id = p.parish_id
order by podejrzenie, parafia nulls first, rola, u.email;
