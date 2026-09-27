-- =============================================================
-- KONTA DO POPRAWY PO WDROŻENIU 20260928000000_admin_tools.sql (TYLKO ODCZYT)
-- Skutki starego błędu rejestracji:
--  a) imię = adres e-mail (profil nieuzupełniony)
--  b) założyciel parafii, który nie jest w niej adminem
-- Popraw: (a) admin parafii → profil członka → „Zmień na rodzica” / poproś o uzupełnienie imienia,
--         (b) update profiles set role = 'admin' where id = '<id>';  (po upewnieniu się, że to właściwa osoba)
-- =============================================================
select 'imię = e-mail' as problem, p.id, p.full_name, p.role, pa.name as parafia
  from profiles p left join parishes pa on pa.id = p.parish_id
 where p.full_name like '%@%'
union all
select 'założyciel nie jest adminem', p.id, p.full_name, p.role, pa.name
  from parishes pa join profiles p on p.id = pa.created_by and p.parish_id = pa.id
 where p.role <> 'admin' and p.is_admin is not true
order by problem, parafia;
