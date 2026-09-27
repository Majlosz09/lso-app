-- =============================================================
-- LISTA PARAFII DO PRZESIEWU (TYLKO ODCZYT)
-- Kolumna "podejrzenie" to tylko podpowiedź — decyzję podejmujesz Ty.
-- =============================================================
select
  pa.id,
  pa.name                                   as parafia,
  pa.city                                   as miasto,
  to_jsonb(pa)->>'created_at'               as utworzona,
  cu.email                                  as zalozyciel_email,
  (select string_agg(u.email, ', ')
     from profiles p join auth.users u on u.id = p.id
    where p.parish_id = pa.id and (p.role = 'admin' or p.is_admin))
                                            as admini,
  (select count(*) from profiles p where p.parish_id = pa.id and p.role = 'member') as ministranci,
  (select count(*) from profiles p where p.parish_id = pa.id and p.role = 'parent') as rodzice,
  (select max(u.last_sign_in_at) from profiles p join auth.users u on u.id = p.id
    where p.parish_id = pa.id)              as ostatnie_logowanie,
  (select max(a.checked_at) from attendance a where a.parish_id = pa.id) as ostatnia_obecnosc,
  case
    when cu.email ilike any (array['%@lso.test', 'milosz.jakubczak@%', '%@brival.co', '%test%', '%@da.pl'])
      or pa.name ilike any (array['%test%', '%jac%', '%demo%'])
      then 'MOJA / TESTOWA?'
    else 'PRAWDZIWA?'
  end                                       as podejrzenie
from parishes pa
left join auth.users cu on cu.id = pa.created_by
order by podejrzenie, pa.name;
