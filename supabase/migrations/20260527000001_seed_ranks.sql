-- Seed systemic formation ranks (parish_id NULL = visible to all parishes, is_system = no delete in UI)
insert into ranks (name, "order", is_system, parish_id)
select name, "order", true, null
from (values
  ('Kandydat',       1),
  ('Ministrant',     2),
  ('Lektor Młodszy', 3),
  ('Lektor Starszy', 4),
  ('Ceremoniarz',    5)
) as v(name, "order")
where not exists (
  select 1 from ranks r where r.name = v.name and r.parish_id is null
);
