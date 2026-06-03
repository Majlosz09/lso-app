-- Enable realtime for profiles and member_badges so rank/badge
-- changes propagate immediately to all connected clients.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table profiles;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'member_badges'
  ) then
    alter publication supabase_realtime add table member_badges;
  end if;
end
$$;
